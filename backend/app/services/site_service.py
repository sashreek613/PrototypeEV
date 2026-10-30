"""Thin adapter between the `sites`/`chargers` DB tables and the pure
scoring engine in app/engines/site_scoring.py.

This is the ONLY place that builds a SiteScoringInput. When a teammate's
real demand model or grid model lands, this file is what changes -- the
engine itself stays a pure function of whatever gets handed to it.

Real Bengaluru data (candidate sites, substations, EV registrations, and --
once OCM_API_KEY is set -- real chargers) is loaded from data/*.json via
app/services/mock_store.py and cached in-process (it's small and doesn't
change without re-running the fetch script), independent of whatever rows
currently live in the `sites`/`chargers` tables. That keeps this adapter
correct regardless of whether `sites` holds the original 10 demo rows or a
future real-candidate seed -- only the site's own lat/lon is read from the
DB row; everything around it comes from the real data files.
"""

from __future__ import annotations

import math
from functools import lru_cache
from typing import Any, Iterable

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.engines.location_search import NameRecord, best_match, search_names
from app.engines.site_scoring import (
    POI_DENSITY_RADIUS_KM,
    ChargerRef,
    SiteScoringInput,
    SubstationRef,
    haversine_km,
    score_site,
)
from app.models.charger import Charger
from app.models.site import Site
from app.schemas.site import (
    ClassifiedSiteRead,
    LocationSuggestion,
    NearestCandidateRead,
    RecommendedSiteRead,
    ScoredFactorRead,
    SiteRead,
)
from app.services import mock_store

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200
DEFAULT_RECOMMENDED_LIMIT = 10
MAX_RECOMMENDED_LIMIT = 50
DEFAULT_SUGGEST_LIMIT = 8
MAX_SUGGEST_LIMIT = 20

# How far a site can be from the nearest real substation / real candidate
# POI before we treat the dataset as simply not covering that area, rather
# than attaching an implausibly distant match.
_MAX_SUBSTATION_SEARCH_KM = 15.0
_LAND_MATCH_RADIUS_KM = 1.0

# The real BBMP / Greater Bengaluru Authority boundary (OSM relation
# 7902476), as resolved by app/scripts/fetch_bengaluru_data.py -- see
# data/README.md. Every real data file this adapter reads was scoped to
# this boundary, so a point outside it has no data behind it; classify()
# must refuse to score one rather than silently extrapolating.
BBMP_BBOX = {
    "min_lat": 12.8334905,
    "max_lat": 13.1426196,
    "min_lon": 77.4598797,
    "max_lon": 77.7840639,
}


def is_within_bbox(latitude: float, longitude: float) -> bool:
    return (
        BBMP_BBOX["min_lat"] <= latitude <= BBMP_BBOX["max_lat"]
        and BBMP_BBOX["min_lon"] <= longitude <= BBMP_BBOX["max_lon"]
    )


# ---------------------------------------------------------------------------
# Real-data loaders -- cached in-process. lru_cache is fine here: these
# files only change by re-running fetch_bengaluru_data.py, which happens
# offline, not while the API is serving requests.
# ---------------------------------------------------------------------------


@lru_cache(maxsize=1)
def _candidate_sites() -> list[dict[str, Any]]:
    return mock_store.load_candidate_sites()


@lru_cache(maxsize=1)
def _substations() -> list[dict[str, Any]]:
    return [s for s in mock_store.load_substations() if s.get("latitude") is not None]


@lru_cache(maxsize=1)
def _real_chargers() -> list[dict[str, Any]] | None:
    """None means OpenChargeMap hasn't been fetched yet (see data/README.md);
    callers fall back to the DB's demo chargers in that case."""
    return mock_store.load_real_chargers()


@lru_cache(maxsize=1)
def _localities() -> list[dict[str, Any]]:
    return mock_store.load_localities()


@lru_cache(maxsize=1)
def _name_index() -> list[NameRecord]:
    """Real names for /api/sites/suggest and classify?q= -- named candidate
    sites (individual POIs) plus localities (neighbourhood-level names).
    Unnamed OSM candidates are excluded; they'd never be a useful search
    result."""
    records = [
        NameRecord(id=c["id"], name=c["name"], latitude=c["latitude"], longitude=c["longitude"], kind="candidate_site")
        for c in _candidate_sites()
        if c["name_is_real"]
    ]
    records += [
        NameRecord(id=loc["id"], name=loc["name"], latitude=loc["latitude"], longitude=loc["longitude"], kind="locality")
        for loc in _localities()
    ]
    return records


@lru_cache(maxsize=1)
def _citywide_ev_share_pct() -> float | None:
    """Real, citywide EV registration share for the latest year in the VAHAN
    data. Applied as a macro multiplier on every site's demand score.

    Per-site RTO assignment would be more precise, but neither the VAHAN CSV
    nor OSM reliably exposes RTO jurisdiction boundaries or verified office
    coordinates (checked: OSM's "RTO" name search returns partial, unverifiable
    matches for only some of the 10 RTOs). Rather than fabricate a per-site
    RTO lookup on unreliable geocoding, this uses one real citywide number for
    every site -- honest about being city-level, not site-level, precision.
    TODO: replace with per-site RTO assignment if a teammate has verified
    RTO jurisdiction boundaries.
    """
    rows = mock_store.load_ev_registrations()
    if not rows:
        return None
    latest_year = max(r["year"] for r in rows)
    year_rows = [r for r in rows if r["year"] == latest_year]
    total_ev = sum(r["ev_count"] for r in year_rows)
    total_all = sum(r["total_registrations"] for r in year_rows)
    if not total_all:
        return None
    return round(100 * total_ev / total_all, 2)


# ~1.1 km / ~5.5 km cells. Lookups expand by the search radius so results
# match a full scan; this only avoids walking the whole Bengaluru extract.
_CANDIDATE_GRID_DEG = 0.01
_SUBSTATION_GRID_DEG = 0.05


def _cell(lat: float, lon: float, cell_deg: float) -> tuple[int, int]:
    return (math.floor(lat / cell_deg), math.floor(lon / cell_deg))


def _cells_for_radius(lat: float, lon: float, radius_km: float, cell_deg: float) -> Iterable[tuple[int, int]]:
    lat_pad = radius_km / 111.0
    lon_pad = radius_km / (111.0 * max(0.2, math.cos(math.radians(lat))))
    row0, col0 = _cell(lat - lat_pad, lon - lon_pad, cell_deg)
    row1, col1 = _cell(lat + lat_pad, lon + lon_pad, cell_deg)
    for row in range(row0, row1 + 1):
        for col in range(col0, col1 + 1):
            yield (row, col)


@lru_cache(maxsize=1)
def _candidate_spatial_index() -> tuple[float, dict[tuple[int, int], list[dict[str, Any]]]]:
    grid: dict[tuple[int, int], list[dict[str, Any]]] = {}
    for candidate in _candidate_sites():
        key = _cell(candidate["latitude"], candidate["longitude"], _CANDIDATE_GRID_DEG)
        grid.setdefault(key, []).append(candidate)
    return _CANDIDATE_GRID_DEG, grid


@lru_cache(maxsize=1)
def _substation_spatial_index() -> tuple[float, dict[tuple[int, int], list[dict[str, Any]]]]:
    grid: dict[tuple[int, int], list[dict[str, Any]]] = {}
    for sub in _substations():
        key = _cell(sub["latitude"], sub["longitude"], _SUBSTATION_GRID_DEG)
        grid.setdefault(key, []).append(sub)
    return _SUBSTATION_GRID_DEG, grid


def _candidates_near(lat: float, lon: float, radius_km: float) -> list[dict[str, Any]]:
    cell_deg, grid = _candidate_spatial_index()
    nearby: list[dict[str, Any]] = []
    for key in _cells_for_radius(lat, lon, radius_km, cell_deg):
        nearby.extend(grid.get(key, ()))
    return nearby


def _substations_near(lat: float, lon: float, radius_km: float) -> list[dict[str, Any]]:
    cell_deg, grid = _substation_spatial_index()
    nearby: list[dict[str, Any]] = []
    for key in _cells_for_radius(lat, lon, radius_km, cell_deg):
        nearby.extend(grid.get(key, ()))
    return nearby


def _nearest_candidate(lat: float, lon: float) -> dict[str, Any] | None:
    nearby = _candidates_near(lat, lon, _LAND_MATCH_RADIUS_KM)
    if not nearby:
        return None
    best = min(nearby, key=lambda c: haversine_km(lat, lon, c["latitude"], c["longitude"]))
    if haversine_km(lat, lon, best["latitude"], best["longitude"]) > _LAND_MATCH_RADIUS_KM:
        return None
    return best


def _poi_density(lat: float, lon: float) -> int:
    return sum(
        1
        for c in _candidates_near(lat, lon, POI_DENSITY_RADIUS_KM)
        if haversine_km(lat, lon, c["latitude"], c["longitude"]) <= POI_DENSITY_RADIUS_KM
    )


def _substation_ref(best: dict[str, Any]) -> SubstationRef:
    voltage = best.get("bescom_voltage_class_kv")
    if voltage is None:
        osm_voltages = best.get("osm_voltage_kv") or []
        voltage = osm_voltages[0] if osm_voltages else None
    return SubstationRef(
        id=best["id"],
        name=best.get("name"),
        latitude=best["latitude"],
        longitude=best["longitude"],
        voltage_kv=voltage,
    )


def _nearest_substation(lat: float, lon: float) -> SubstationRef | None:
    nearby = _substations_near(lat, lon, _MAX_SUBSTATION_SEARCH_KM)
    if not nearby:
        return None
    best = min(nearby, key=lambda s: haversine_km(lat, lon, s["latitude"], s["longitude"]))
    if haversine_km(lat, lon, best["latitude"], best["longitude"]) > _MAX_SUBSTATION_SEARCH_KM:
        return None
    return _substation_ref(best)


@lru_cache(maxsize=1)
def _ocm_charger_refs() -> tuple[ChargerRef, ...] | None:
    real = _real_chargers()
    if real is None:
        return None
    return tuple(
        ChargerRef(id=c["id"], name=c["name"], latitude=c["latitude"], longitude=c["longitude"], source="OCM")
        for c in real
    )


def _demo_chargers_with_site(db: Session) -> list[tuple[ChargerRef, str | None]]:
    return [
        (
            ChargerRef(id=c.id, name=c.name, latitude=c.latitude, longitude=c.longitude, source="DEMO"),
            c.site_id,
        )
        for c in db.query(Charger).all()
    ]


def _nearby_chargers(
    db: Session,
    *,
    exclude_site_id: str | None,
    demo_chargers: list[tuple[ChargerRef, str | None]] | None = None,
) -> list[ChargerRef]:
    ocm = _ocm_charger_refs()
    if ocm is not None:
        return list(ocm)
    # Fallback: OpenChargeMap not fetched yet (see data/README.md). Use the
    # DB's demo chargers instead -- but CRITICAL: when scoring an existing
    # seeded Site, exclude ITS OWN linked charger(s). The demo seed data
    # (data/chargers.json) places each site's own charger ~50-100m away, so
    # including it would make that site's nearest-charger distance look
    # identical to every other site's and collapse the whole coverage_gap
    # sub-score. An arbitrary classify()'d point has no own-site charger to
    # exclude, so exclude_site_id is None there -- correct, not an oversight.
    rows = demo_chargers if demo_chargers is not None else _demo_chargers_with_site(db)
    if exclude_site_id is None:
        return [ref for ref, _site_id in rows]
    return [ref for ref, site_id in rows if site_id != exclude_site_id]


def _build_scoring_input_for_point(
    db: Session,
    *,
    point_id: str,
    name: str,
    latitude: float,
    longitude: float,
    exclude_site_id: str | None,
    demo_chargers: list[tuple[ChargerRef, str | None]] | None = None,
) -> SiteScoringInput:
    """The ONE place a SiteScoringInput gets built -- used for every seeded
    Site (via _build_scoring_input below) AND for classify()'s arbitrary
    points, so the ranked list and the classify endpoint are always scored
    by the exact same logic, never two parallel paths."""
    nearest = _nearest_candidate(latitude, longitude)
    return SiteScoringInput(
        site_id=point_id,
        name=name,
        latitude=latitude,
        longitude=longitude,
        poi_density_count=_poi_density(latitude, longitude),
        land_category=nearest["category"] if nearest else "unknown",
        citywide_ev_share_pct=_citywide_ev_share_pct(),
        nearby_chargers=_nearby_chargers(db, exclude_site_id=exclude_site_id, demo_chargers=demo_chargers),
        nearest_substation=_nearest_substation(latitude, longitude),
        parking_capacity=(nearest.get("capacity") if nearest else None),
        land_area_m2=(nearest.get("area_m2") if nearest else None),
    )


def _build_scoring_input(
    db: Session,
    site: Site,
    demo_chargers: list[tuple[ChargerRef, str | None]] | None = None,
) -> SiteScoringInput:
    return _build_scoring_input_for_point(
        db,
        point_id=site.id,
        name=site.name,
        latitude=site.latitude,
        longitude=site.longitude,
        exclude_site_id=site.id,
        demo_chargers=demo_chargers,
    )


def _to_site_read(
    db: Session,
    site: Site,
    demo_chargers: list[tuple[ChargerRef, str | None]] | None = None,
) -> SiteRead:
    result = score_site(_build_scoring_input(db, site, demo_chargers=demo_chargers))
    return SiteRead(
        id=site.id,
        name=site.name,
        latitude=site.latitude,
        longitude=site.longitude,
        demand_score=result.demand_score,
        grid_capacity_score=result.grid_capacity_score,
        accessibility_score=result.accessibility_score,
        charger_gap_score=result.charger_gap_score,
        site_score=result.site_score,
        recommendation=result.recommendation,
        factors=[ScoredFactorRead(**vars(f)) for f in result.factors],
        explanation=result.explanation,
    )


def _demo_chargers_for_batch(db: Session) -> list[tuple[ChargerRef, str | None]] | None:
    if _ocm_charger_refs() is not None:
        return None
    return _demo_chargers_with_site(db)


def list_sites(db: Session, limit: int = DEFAULT_PAGE_SIZE, offset: int = 0) -> list[SiteRead]:
    sites = (
        db.query(Site)
        .order_by(Site.name)
        .offset(max(0, offset))
        .limit(max(1, min(limit, MAX_PAGE_SIZE)))
        .all()
    )
    demo_chargers = _demo_chargers_for_batch(db)
    return [_to_site_read(db, site, demo_chargers=demo_chargers) for site in sites]


def get_site(db: Session, site_id: str) -> SiteRead:
    site = db.get(Site, site_id)
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    return _to_site_read(db, site)


def list_recommended_sites(db: Session, limit: int = DEFAULT_RECOMMENDED_LIMIT) -> list[RecommendedSiteRead]:
    """All sites, scored and sorted by site_score desc, capped to `limit`.

    Note: unauthenticated, matching the existing /sites routes. Follow-up:
    gate behind Depends(require_planner) (app/api/deps.py) once the frontend
    is ready to send an auth header from the planner dashboard.
    """
    sites = db.query(Site).all()
    demo_chargers = _demo_chargers_for_batch(db)
    scored = sorted(
        (_to_site_read(db, site, demo_chargers=demo_chargers) for site in sites),
        key=lambda s: s.site_score,
        reverse=True,
    )
    capped = scored[: max(1, min(limit, MAX_RECOMMENDED_LIMIT))]
    return [RecommendedSiteRead(rank=i + 1, **site.model_dump()) for i, site in enumerate(capped)]


# ---------------------------------------------------------------------------
# Map-first classification: GET /api/sites/classify, GET /api/sites/suggest
# ---------------------------------------------------------------------------


def suggest_locations(query: str, limit: int = DEFAULT_SUGGEST_LIMIT) -> list[LocationSuggestion]:
    capped = max(1, min(limit, MAX_SUGGEST_LIMIT))
    matches = search_names(query, _name_index(), limit=capped)
    return [
        LocationSuggestion(id=m.id, name=m.name, latitude=m.latitude, longitude=m.longitude, kind=m.kind)
        for m in matches
    ]


def _resolve_query_location(query: str) -> tuple[str, float, float]:
    match = best_match(query, _name_index())
    if match is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No known Bengaluru location matches '{query}'. Try a different spelling or a nearby landmark.",
        )
    return match.name, match.latitude, match.longitude


def _nearest_seeded_site(db: Session, latitude: float, longitude: float) -> tuple[Site, float] | None:
    sites = db.query(Site).all()
    if not sites:
        return None
    best = min(sites, key=lambda s: haversine_km(latitude, longitude, s.latitude, s.longitude))
    return best, haversine_km(latitude, longitude, best.latitude, best.longitude)


def _classify_point(db: Session, latitude: float, longitude: float, *, resolved_name: str | None) -> ClassifiedSiteRead:
    if not is_within_bbox(latitude, longitude):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"({latitude}, {longitude}) is outside Bengaluru/BBMP "
                f"({BBMP_BBOX['min_lat']}-{BBMP_BBOX['max_lat']} N, "
                f"{BBMP_BBOX['min_lon']}-{BBMP_BBOX['max_lon']} E), the only area this model has "
                "real data for. Refusing to score a point with no data behind it."
            ),
        )

    name = resolved_name or f"{latitude:.4f}, {longitude:.4f}"
    point_id = f"point-{latitude:.5f}-{longitude:.5f}"
    # Same builder, same score_site() call as every seeded Site -- see
    # _build_scoring_input_for_point's docstring. No parallel scoring path.
    result = score_site(
        _build_scoring_input_for_point(
            db, point_id=point_id, name=name, latitude=latitude, longitude=longitude, exclude_site_id=None
        )
    )

    nearest_candidate: NearestCandidateRead | None = None
    nearest = _nearest_seeded_site(db, latitude, longitude)
    if nearest is not None:
        nearest_site, distance_km = nearest
        nearest_read = _to_site_read(db, nearest_site)
        nearest_candidate = NearestCandidateRead(
            id=nearest_read.id,
            name=nearest_read.name,
            site_score=nearest_read.site_score,
            recommendation=nearest_read.recommendation,
            distance_km=round(distance_km, 2),
        )

    return ClassifiedSiteRead(
        name=name,
        latitude=latitude,
        longitude=longitude,
        demand_score=result.demand_score,
        grid_capacity_score=result.grid_capacity_score,
        accessibility_score=result.accessibility_score,
        charger_gap_score=result.charger_gap_score,
        site_score=result.site_score,
        recommendation=result.recommendation,
        factors=[ScoredFactorRead(**vars(f)) for f in result.factors],
        explanation=result.explanation,
        in_bbox=True,
        nearest_candidate=nearest_candidate,
    )


def classify(db: Session, *, latitude: float | None, longitude: float | None, query: str | None) -> ClassifiedSiteRead:
    """Entry point for GET /api/sites/classify. Exactly one of (latitude AND
    longitude) or query must be given; the route validates that."""
    if query is not None:
        name, resolved_lat, resolved_lon = _resolve_query_location(query)
        return _classify_point(db, resolved_lat, resolved_lon, resolved_name=name)
    if latitude is None or longitude is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either `q` (a place name) or both `lat` and `lon`.",
        )
    return _classify_point(db, latitude, longitude, resolved_name=None)
