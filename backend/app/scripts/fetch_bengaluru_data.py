"""Offline, run-once ingestion of real Bengaluru infrastructure and demand data.

Run with:
    python -m app.scripts.fetch_bengaluru_data [--refresh]

Writes:
  data/raw/...                       cached raw API/CSV responses (never
                                      re-fetched unless --refresh is passed)
  data/chargers_bengaluru.json       real chargers, from OpenChargeMap
  data/candidate_sites_bengaluru.json  real candidate locations, from OSM/Overpass
  data/substations_bengaluru.json    grid proxy, OSM power infra x BESCOM CSV
  data/ev_registrations_bengaluru.json  demand prior, VAHAN via OpenCity

The FastAPI app never calls these sources at request time. This script is the
only network client in the whole project; everything it writes is committed
as static JSON and loaded by the seed scripts. Re-running it is safe: raw
responses are cached to data/raw/, and the four output files above are fully
rewritten from the cache each run so results stay reproducible without
re-hitting any API.

See data/README.md for licensing terms per source and the fetch date.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from app.core.config import get_settings

# --------------------------------------------------------------------------
# Constants
# --------------------------------------------------------------------------

DATA_DIR: Path = get_settings().DATA_DIR
RAW_DIR = DATA_DIR / "raw"

USER_AGENT = "VidyutOne-DataFetch/1.0 (student project; contact: samrudhps19@gmail.com)"

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OCM_URL = "https://api.openchargemap.io/v3/poi"

# OSM relation for "Bengaluru" (admin_level=7, operator="Greater Bengaluru
# Authority" -- the successor to BBMP). Confirmed by querying Overpass for
# boundary=administrative relations named Bengaluru/Bruhat Bengaluru; see
# fetch_bbmp_boundary(). This is the actual jurisdiction polygon, not a
# hand-picked bounding box.
BBMP_RELATION_ID = 7902476

# The task brief's bbox, kept only to print a sanity-check delta against the
# real boundary pulled from Overpass -- never used to filter data.
BRIEF_BBOX = {"min_lat": 12.79, "max_lat": 13.14, "min_lon": 77.45, "max_lon": 77.78}

OCM_BASE_PARAMS = {
    "output": "json",
    "countrycode": "IN",
    "latitude": 12.97,
    "longitude": 77.59,
    "distance": 30,
    "distanceunit": "KM",
    "maxresults": 500,
}

# Candidate-site anchor categories. Each maps to an Overpass tag filter.
# One query per category, run sequentially with a sleep between them --
# Overpass rejects rapid-fire bulk queries from one client.
CANDIDATE_CATEGORIES: dict[str, str] = {
    "fuel_station": '["amenity"="fuel"]',
    "parking": '["amenity"="parking"]',
    "mall": '["shop"="mall"]',
    "bus_station": '["amenity"="bus_station"]',
    "metro_station": '["railway"="station"]["station"="subway"]',
}

# Locality-level names ("Whitefield", "Jayanagar") for the /api/sites/suggest
# and /api/sites/classify?q= name search -- the candidate-site names above
# are individual POIs, not neighbourhoods, so a planner typing an area name
# needs this separate, coarser index.
LOCALITY_FILTER = '["place"~"^(suburb|neighbourhood)$"]'

# EV fuel-type labels found in the VAHAN "Registration Fuel" metric (checked
# against the 2021 and 2025 CSVs). "STRONG HYBRID EV" is deliberately
# excluded -- those are self-charging hybrids that never plug in, so they
# don't drive charger demand the way the other three do.
EV_FUEL_TYPES = {"PURE EV", "ELECTRIC(BOV)", "PLUG-IN HYBRID EV"}

VAHAN_RESOURCE_URLS = {
    2021: "https://data.opencity.in/dataset/71ab0845-b439-4c39-bf53-d157ae10bdef/resource/cdbd693d-2f1d-4fad-a43f-878f54f73cdf/download/e4fe1f99-a49d-4642-88b5-03c4479bc6be.csv",
    2022: "https://data.opencity.in/dataset/71ab0845-b439-4c39-bf53-d157ae10bdef/resource/7d9c429d-45f9-42ae-a869-51415f51c769/download/c9e55b76-e0da-4864-96e4-91f383a96812.csv",
    2023: "https://data.opencity.in/dataset/71ab0845-b439-4c39-bf53-d157ae10bdef/resource/76c2fd86-f061-4d56-a496-4733ddbeb9b0/download/32394726-4451-424f-9e2f-1c4c7b979240.csv",
    2024: "https://data.opencity.in/dataset/71ab0845-b439-4c39-bf53-d157ae10bdef/resource/952d0b2f-63f5-4628-af82-b4e6ffaed605/download/a95a4755-b1a1-4c99-979f-2540080990df.csv",
    2025: "https://data.opencity.in/dataset/71ab0845-b439-4c39-bf53-d157ae10bdef/resource/c4c2b458-1d7f-4da1-b7d1-c5a02fb0f133/download/da330e05-c93c-42a3-94ba-09ebd5dd28d3.csv",
}

BESCOM_SUBSTATIONS_URL = "https://data.opencity.in/dataset/1b90de58-1e06-4b2c-bd29-2261493036a1/resource/3c779061-159d-40ee-bc07-92691d4eec70/download/9f945eb2-b531-4d5f-a096-b9d6ddd7b1d4.csv"


# --------------------------------------------------------------------------
# HTTP helpers -- caching + retry live here, nowhere else touches the network
# --------------------------------------------------------------------------


def _cache_path(name: str, ext: str) -> Path:
    return RAW_DIR / f"{name}.{ext}"


def _read_cache_json(name: str) -> Any | None:
    path = _cache_path(name, "json")
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return None


def _write_cache_json(name: str, payload: Any) -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    _cache_path(name, "json").write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _read_cache_text(name: str, ext: str) -> str | None:
    path = _cache_path(name, ext)
    if path.exists():
        return path.read_text(encoding="utf-8")
    return None


def _write_cache_text(name: str, ext: str, text: str) -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    _cache_path(name, ext).write_text(text, encoding="utf-8")


def _overpass_query(query: str, cache_name: str, *, refresh: bool, retries: int = 3) -> dict:
    """POST one Overpass query, caching the raw JSON response.

    Retries transient 5xx/429 (Overpass is a shared public server that
    frequently 504s under load) with backoff. Does NOT retry on 4xx other
    than 429 -- those mean the query itself is wrong.
    """
    if not refresh:
        cached = _read_cache_json(cache_name)
        if cached is not None:
            print(f"  [cache] {cache_name}")
            return cached

    headers = {"User-Agent": USER_AGENT}
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            resp = httpx.post(OVERPASS_URL, data={"data": query}, headers=headers, timeout=120)
        except httpx.HTTPError as exc:
            last_error = exc
        else:
            if resp.status_code == 200:
                data = resp.json()
                _write_cache_json(cache_name, data)
                return data
            if resp.status_code in (429, 502, 503, 504):
                last_error = RuntimeError(f"Overpass {resp.status_code} on attempt {attempt}")
            else:
                raise RuntimeError(f"Overpass query '{cache_name}' failed: {resp.status_code} {resp.text[:300]}")
        wait = 5 * attempt
        print(f"  [retry] {cache_name} attempt {attempt} failed ({last_error}); waiting {wait}s")
        time.sleep(wait)
    raise RuntimeError(f"Overpass query '{cache_name}' failed after {retries} attempts: {last_error}")


def _http_get_text(url: str, cache_name: str, ext: str, *, refresh: bool, headers: dict | None = None) -> str:
    if not refresh:
        cached = _read_cache_text(cache_name, ext)
        if cached is not None:
            print(f"  [cache] {cache_name}.{ext}")
            return cached
    resp = httpx.get(url, headers={"User-Agent": USER_AGENT, **(headers or {})}, timeout=60, follow_redirects=True)
    resp.raise_for_status()
    _write_cache_text(cache_name, ext, resp.text)
    return resp.text


# --------------------------------------------------------------------------
# Geometry -- no shapely; equirectangular-projected shoelace formula, which
# is plenty accurate at Bengaluru's latitude for feature-sized polygons.
# --------------------------------------------------------------------------

EARTH_RADIUS_M = 6371000.0


def _project_local(lat: float, lon: float, ref_lat: float, ref_lon: float) -> tuple[float, float]:
    x = math.radians(lon - ref_lon) * math.cos(math.radians(ref_lat)) * EARTH_RADIUS_M
    y = math.radians(lat - ref_lat) * EARTH_RADIUS_M
    return x, y


def polygon_area_and_centroid(coords: list[tuple[float, float]]) -> tuple[float | None, tuple[float, float]]:
    """coords: list of (lat, lon). Returns (area_m2 or None, (centroid_lat, centroid_lon))."""
    if len(coords) < 3:
        lat = sum(c[0] for c in coords) / len(coords)
        lon = sum(c[1] for c in coords) / len(coords)
        return None, (lat, lon)

    ref_lat = coords[0][0]
    ref_lon = coords[0][1]
    pts = [_project_local(lat, lon, ref_lat, ref_lon) for lat, lon in coords]
    if pts[0] != pts[-1]:
        pts.append(pts[0])

    area_acc = 0.0
    cx_acc = 0.0
    cy_acc = 0.0
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        cross = x0 * y1 - x1 * y0
        area_acc += cross
        cx_acc += (x0 + x1) * cross
        cy_acc += (y0 + y1) * cross
    area_signed = area_acc / 2.0
    if abs(area_signed) < 1e-6:
        # degenerate (open way / line, not a closed polygon) -- fall back to
        # averaging vertices for the centroid, no area.
        lat = sum(c[0] for c in coords) / len(coords)
        lon = sum(c[1] for c in coords) / len(coords)
        return None, (lat, lon)

    cx = cx_acc / (6 * area_signed)
    cy = cy_acc / (6 * area_signed)
    centroid_lat = ref_lat + math.degrees(cy / EARTH_RADIUS_M)
    centroid_lon = ref_lon + math.degrees(cx / (EARTH_RADIUS_M * math.cos(math.radians(ref_lat))))
    return round(abs(area_signed), 1), (centroid_lat, centroid_lon)


# --------------------------------------------------------------------------
# SOURCE 0 -- BBMP boundary (used to scope every Overpass query below)
# --------------------------------------------------------------------------


def fetch_bbmp_boundary(*, refresh: bool) -> dict:
    query = f"""
    [out:json][timeout:60];
    rel({BBMP_RELATION_ID});
    out tags bb;
    """
    data = _overpass_query(query, "overpass_boundary_bbmp", refresh=refresh)
    elements = data.get("elements", [])
    if not elements:
        raise RuntimeError(f"BBMP relation {BBMP_RELATION_ID} returned no elements -- id may be stale")
    el = elements[0]
    tags = el.get("tags", {})
    bounds = el.get("bounds", {})
    result = {
        "relation_id": BBMP_RELATION_ID,
        "name": tags.get("name"),
        "operator": tags.get("operator"),
        "admin_level": tags.get("admin_level"),
        "bounds": bounds,
    }
    print(f"BBMP boundary: relation {BBMP_RELATION_ID} '{result['name']}' "
          f"(operator: {result['operator']}, admin_level {result['admin_level']})")
    print(f"  real bounds : {bounds}")
    print(f"  brief bbox  : {BRIEF_BBOX}")
    if bounds:
        drift = {
            "min_lat": round(bounds["minlat"] - BRIEF_BBOX["min_lat"], 3),
            "max_lat": round(bounds["maxlat"] - BRIEF_BBOX["max_lat"], 3),
            "min_lon": round(bounds["minlon"] - BRIEF_BBOX["min_lon"], 3),
            "max_lon": round(bounds["maxlon"] - BRIEF_BBOX["max_lon"], 3),
        }
        print(f"  drift (deg) : {drift}")
    return result


# --------------------------------------------------------------------------
# SOURCE 1 -- OpenChargeMap (real existing chargers)
# --------------------------------------------------------------------------


def _ocm_headers(api_key: str) -> dict[str, str]:
    return {"User-Agent": USER_AGENT, "X-API-Key": api_key}


def map_ocm_pois_to_chargers(pois: list[dict]) -> list[dict]:
    """The one place an OCM POI becomes our charger dict shape -- used by
    both the bulk cached fetch below and charger_service.py's live refresh,
    so a POI is never mapped two different ways.

    availability comes from StatusType.IsOperational -- OCM's infrastructure
    operational status (e.g. "Operational" / "Under Maintenance"), NOT live
    per-plug occupancy. None means OCM has no status data for that POI,
    which is common; that stays None, it is never defaulted to True.
    """
    chargers: list[dict] = []
    for poi in pois:
        addr = poi.get("AddressInfo") or {}
        lat = addr.get("Latitude")
        lon = addr.get("Longitude")
        if lat is None or lon is None:
            continue
        operator = (poi.get("OperatorInfo") or {}).get("Title") or "Unknown"
        status_type = poi.get("StatusType")
        availability = status_type.get("IsOperational") if status_type else None
        status_title = status_type.get("Title") if status_type else None
        connections = poi.get("Connections") or [None]
        for idx, conn in enumerate(connections):
            conn = conn or {}
            connection_type = (conn.get("ConnectionType") or {}).get("Title") or "Unknown"
            power_kw = conn.get("PowerKW")
            chargers.append(
                {
                    "id": f"ocm-{poi.get('ID')}-{idx}",
                    "ocm_poi_id": poi.get("ID"),
                    "name": addr.get("Title") or f"OCM site {poi.get('ID')}",
                    "latitude": lat,
                    "longitude": lon,
                    "power_kw": power_kw,
                    "connector_type": connection_type,
                    "operator": operator,
                    "availability": availability,
                    "status_title": status_title,
                    "source": "OCM",
                }
            )
    return chargers


def fetch_chargers(*, refresh: bool) -> list[dict]:
    settings = get_settings()
    api_key = settings.OCM_API_KEY.strip()
    if not api_key or api_key == "REPLACE_WITH_YOUR_KEY":
        raise RuntimeError(
            "OCM_API_KEY is not set. Register a free key at openchargemap.org "
            "-> profile -> My Apps, then put it in backend/.env as OCM_API_KEY=<key>."
        )

    if not refresh and _read_cache_json("ocm_pois") is not None:
        pois = _read_cache_json("ocm_pois")
        print("  [cache] ocm_pois.json")
    else:
        resp = httpx.get(OCM_URL, params=OCM_BASE_PARAMS, headers=_ocm_headers(api_key), timeout=60)
        if resp.status_code != 200:
            raise RuntimeError(f"OpenChargeMap request failed: {resp.status_code} {resp.text[:300]}")
        pois = resp.json()
        _write_cache_json("ocm_pois", pois)

    chargers = map_ocm_pois_to_chargers(pois)
    print(f"  {len(pois)} POIs -> {len(chargers)} charger/connector rows")
    return chargers


def fetch_chargers_near(*, latitude: float, longitude: float, radius_km: float, api_key: str) -> list[dict]:
    """Live OCM call for a specific area -- used by POST /api/chargers/refresh
    (charger_service.py). Deliberately NOT cached to data/raw/: this is the
    one path in the app that's meant to hit OCM live, on an explicit user
    action, not on every page load. Same POI mapping as the bulk fetch
    above (map_ocm_pois_to_chargers), so a POI is scored/shown consistently
    whichever path found it.
    """
    params = {
        "output": "json",
        "countrycode": "IN",
        "latitude": latitude,
        "longitude": longitude,
        "distance": radius_km,
        "distanceunit": "KM",
        "maxresults": 200,
    }
    resp = httpx.get(OCM_URL, params=params, headers=_ocm_headers(api_key), timeout=30)
    if resp.status_code != 200:
        raise RuntimeError(f"OpenChargeMap request failed: {resp.status_code} {resp.text[:300]}")
    return map_ocm_pois_to_chargers(resp.json())


# --------------------------------------------------------------------------
# SOURCE 2 -- OSM/Overpass candidate sites
# --------------------------------------------------------------------------


def fetch_candidate_sites(*, refresh: bool) -> list[dict]:
    candidates: list[dict] = []
    seen: set[tuple[str, float, float]] = set()

    categories = list(CANDIDATE_CATEGORIES.items())
    for i, (category, filter_expr) in enumerate(categories):
        query = f"""
        [out:json][timeout:120];
        rel({BBMP_RELATION_ID});
        map_to_area->.searchArea;
        (
          node{filter_expr}(area.searchArea);
          way{filter_expr}(area.searchArea);
        );
        out geom;
        """
        print(f"Overpass: {category}")
        data = _overpass_query(query, f"overpass_{category}", refresh=refresh)
        elements = data.get("elements", [])
        added = 0
        for el in elements:
            tags = el.get("tags", {})
            area_m2 = None
            if el["type"] == "node":
                lat, lon = el["lat"], el["lon"]
            else:  # way with full geometry
                geom = el.get("geometry") or []
                if not geom:
                    continue
                coords = [(pt["lat"], pt["lon"]) for pt in geom]
                area_m2, (lat, lon) = polygon_area_and_centroid(coords)

            key = (category, round(lat, 5), round(lon, 5))
            if key in seen:
                continue
            seen.add(key)

            capacity = tags.get("capacity")
            try:
                capacity = int(capacity) if capacity is not None else None
            except ValueError:
                capacity = None

            name = tags.get("name") or tags.get("brand")
            unnamed = name is None
            if unnamed:
                name = f"Unnamed {category.replace('_', ' ')} ({el['type']}/{el['id']})"

            candidates.append(
                {
                    "id": f"osm-{el['type'][0]}{el['id']}",
                    "osm_type": el["type"],
                    "osm_id": el["id"],
                    "name": name,
                    "name_is_real": not unnamed,
                    "category": category,
                    "latitude": round(lat, 6),
                    "longitude": round(lon, 6),
                    "capacity": capacity,
                    "area_m2": area_m2,
                    "operator": tags.get("operator"),
                    "source": "OSM",
                }
            )
            added += 1
        print(f"  {len(elements)} elements -> {added} unique candidates")
        if i < len(categories) - 1:
            time.sleep(4)  # be polite to the shared Overpass instance

    return candidates


def fetch_localities(*, refresh: bool) -> list[dict]:
    """place=suburb / place=neighbourhood nodes -- locality-level names
    ("Whitefield", "Jayanagar") for name search, separate from the
    individual-POI candidate sites above."""
    query = f"""
    [out:json][timeout:90];
    rel({BBMP_RELATION_ID});
    map_to_area->.searchArea;
    node{LOCALITY_FILTER}(area.searchArea);
    out;
    """
    print("Overpass: localities (place=suburb/neighbourhood)")
    data = _overpass_query(query, "overpass_localities", refresh=refresh)
    localities: list[dict] = []
    seen: set[tuple[float, float]] = set()
    for el in data.get("elements", []):
        tags = el.get("tags", {})
        name = tags.get("name")
        if not name:
            continue
        key = (round(el["lat"], 5), round(el["lon"], 5))
        if key in seen:
            continue
        seen.add(key)
        localities.append(
            {
                "id": f"osm-n{el['id']}",
                "osm_id": el["id"],
                "name": name,
                "place_type": tags.get("place"),
                "latitude": round(el["lat"], 6),
                "longitude": round(el["lon"], 6),
                "source": "OSM",
            }
        )
    print(f"  {len(data.get('elements', []))} elements -> {len(localities)} unique localities")
    return localities


# --------------------------------------------------------------------------
# SOURCE 3 -- grid proxy: OSM power infra x BESCOM substation list
# --------------------------------------------------------------------------


def _normalize_substation_name(name: str) -> str:
    n = name.upper().strip()
    for junk in ["SUBSTATION", "SUB-STATION", "SUB STATION", "S/S", "(GIS)", "GIS", "SS "]:
        n = n.replace(junk, "")
    return " ".join(n.split())


def fetch_power_infra(*, refresh: bool) -> tuple[list[dict], list[dict]]:
    """Returns (substations, transformers) from OSM."""
    results: dict[str, list[dict]] = {}
    for label, filter_expr in (("substation", '["power"="substation"]'), ("transformer", '["power"="transformer"]')):
        query = f"""
        [out:json][timeout:90];
        rel({BBMP_RELATION_ID});
        map_to_area->.searchArea;
        (
          node{filter_expr}(area.searchArea);
          way{filter_expr}(area.searchArea);
        );
        out center tags;
        """
        print(f"Overpass: power={label}")
        data = _overpass_query(query, f"overpass_{label}", refresh=refresh)
        rows = []
        for el in data.get("elements", []):
            tags = el.get("tags", {})
            if el["type"] == "node":
                lat, lon = el["lat"], el["lon"]
            else:
                center = el.get("center")
                if not center:
                    continue
                lat, lon = center["lat"], center["lon"]
            voltage_raw = tags.get("voltage")
            voltages_kv = []
            if voltage_raw:
                for part in voltage_raw.split(";"):
                    part = part.strip()
                    if part.isdigit():
                        voltages_kv.append(round(int(part) / 1000, 1))
            rows.append(
                {
                    "osm_type": el["type"],
                    "osm_id": el["id"],
                    "name": tags.get("name"),
                    "latitude": lat,
                    "longitude": lon,
                    "voltage_kv": voltages_kv or None,
                }
            )
        print(f"  {len(rows)} {label}s")
        results[label] = rows
        time.sleep(4)
    return results["substation"], results["transformer"]


def fetch_bescom_substations(*, refresh: bool) -> list[dict]:
    text = _http_get_text(BESCOM_SUBSTATIONS_URL, "bescom_substations", "csv", refresh=refresh)
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for row in reader:
        name = (row.get("Name of Sub-Station") or "").strip()
        if not name:
            continue
        voltage_class = (row.get("Voltage Class (in kV)") or "").strip()
        try:
            voltage_kv = float(voltage_class)
        except ValueError:
            voltage_kv = None
        rows.append(
            {
                "name": name,
                "district": (row.get("District") or "").strip(),
                "taluk": (row.get("Taluk") or "").strip(),
                "voltage_class_kv": voltage_kv,
                "commissioned": (row.get("Date of commission") or "").strip(),
            }
        )
    print(f"  BESCOM CSV: {len(rows)} substation rows")
    return rows


def build_substations_dataset(*, refresh: bool) -> list[dict]:
    osm_substations, osm_transformers = fetch_power_infra(refresh=refresh)
    bescom_rows = fetch_bescom_substations(refresh=refresh)

    bescom_by_name = {_normalize_substation_name(r["name"]): r for r in bescom_rows}
    matched_bescom_names: set[str] = set()

    merged: list[dict] = []
    for osm in osm_substations:
        record = {
            "id": f"osm-{osm['osm_type'][0]}{osm['osm_id']}",
            "name": osm["name"],
            "latitude": osm["latitude"],
            "longitude": osm["longitude"],
            "osm_voltage_kv": osm["voltage_kv"],
            "bescom_voltage_class_kv": None,
            "district": None,
            "taluk": None,
            "matched": False,
            "source": "OSM",
        }
        if osm["name"]:
            key = _normalize_substation_name(osm["name"])
            bescom_match = bescom_by_name.get(key)
            if bescom_match:
                record["bescom_voltage_class_kv"] = bescom_match["voltage_class_kv"]
                record["district"] = bescom_match["district"]
                record["taluk"] = bescom_match["taluk"]
                record["matched"] = True
                record["source"] = "OSM+BESCOM"
                matched_bescom_names.add(key)
        merged.append(record)

    # BESCOM rows with no OSM coordinate match are still real substations --
    # keep them (without lat/lon) rather than silently dropping data, flagged
    # so the scoring layer can decide whether to use geo-less rows.
    unmatched = 0
    for key, r in bescom_by_name.items():
        if key in matched_bescom_names:
            continue
        merged.append(
            {
                "id": f"bescom-{key.replace(' ', '-').lower()}",
                "name": r["name"],
                "latitude": None,
                "longitude": None,
                "osm_voltage_kv": None,
                "bescom_voltage_class_kv": r["voltage_class_kv"],
                "district": r["district"],
                "taluk": r["taluk"],
                "matched": False,
                "source": "BESCOM",
            }
        )
        unmatched += 1

    # Transformers: OSM only, no BESCOM equivalent (BESCOM's public list is
    # substation-level). Included as lower-voltage grid points.
    for t in osm_transformers:
        merged.append(
            {
                "id": f"osm-{t['osm_type'][0]}{t['osm_id']}",
                "name": t["name"],
                "latitude": t["latitude"],
                "longitude": t["longitude"],
                "osm_voltage_kv": t["voltage_kv"],
                "bescom_voltage_class_kv": None,
                "district": None,
                "taluk": None,
                "matched": False,
                "source": "OSM",
                "kind": "transformer",
            }
        )

    print(f"  joined: {len(matched_bescom_names)} OSM<->BESCOM name matches, "
          f"{unmatched} BESCOM rows without OSM coordinates, "
          f"{len(osm_transformers)} transformers appended")
    return merged


# --------------------------------------------------------------------------
# SOURCE 4 -- VAHAN EV registrations via OpenCity (RTO-wise)
# --------------------------------------------------------------------------


def fetch_ev_registrations(*, refresh: bool) -> list[dict]:
    rows_by_key: dict[tuple[str, int], dict] = {}
    all_rtos: set[str] = set()

    for year, url in VAHAN_RESOURCE_URLS.items():
        text = _http_get_text(url, f"vahan_{year}", "csv", refresh=refresh)
        reader = csv.DictReader(io.StringIO(text))
        year_rtos: set[str] = set()
        for row in reader:
            rto_name = (row.get("RTO Name") or "").strip()
            if not rto_name:
                continue
            year_rtos.add(rto_name)
            if (row.get("Metric") or "").strip() != "Registration Fuel":
                continue
            rto_code = (row.get("RTO") or "").strip()
            fuel_name = (row.get("Name") or "").strip().upper()
            try:
                count = int(row.get("Count") or 0)
            except ValueError:
                count = 0

            key = (rto_name, year)
            entry = rows_by_key.setdefault(
                key,
                {
                    "rto_name": rto_name,
                    "rto_code": rto_code,
                    "year": year,
                    "ev_count": 0,
                    "total_registrations": 0,
                    "fuel_breakdown": {},
                },
            )
            entry["total_registrations"] += count
            entry["fuel_breakdown"][fuel_name] = entry["fuel_breakdown"].get(fuel_name, 0) + count
            if fuel_name in EV_FUEL_TYPES:
                entry["ev_count"] += count

        all_rtos |= year_rtos
        print(f"  {year}: {len(year_rtos)} distinct RTOs in file")

    print(f"Distinct RTO Name values across all years ({len(all_rtos)}):")
    for name in sorted(all_rtos):
        print(f"  - {name}")
    print(
        "  All of the above are used as-is: this dataset is pre-scoped to "
        "Bengaluru RTO jurisdictions (source is opencity.in's "
        "'bengaluru-rto-wise-vehicle-registration-data'); several genuine "
        "Bengaluru RTOs (e.g. YALAHANKA, JNANABHARATHI) don't contain the "
        "literal string 'BENGALURU', so no further substring filtering is "
        "applied on top of what the source already scoped."
    )

    for entry in rows_by_key.values():
        total = entry["total_registrations"]
        entry["ev_share_pct"] = round(100 * entry["ev_count"] / total, 2) if total else 0.0

    return sorted(rows_by_key.values(), key=lambda r: (r["rto_name"], r["year"]))


# --------------------------------------------------------------------------
# Orchestration
# --------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="ignore data/raw/ cache and re-fetch everything")
    args = parser.parse_args()

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    fetched_at = datetime.now(timezone.utc).isoformat()
    summary: dict[str, Any] = {"fetched_at": fetched_at, "errors": {}}

    print("=" * 70)
    print("SOURCE 0: BBMP boundary")
    print("=" * 70)
    try:
        boundary = fetch_bbmp_boundary(refresh=args.refresh)
        summary["boundary"] = boundary
    except Exception as exc:  # noqa: BLE001 -- report and keep going
        print(f"  FAILED: {exc}")
        summary["errors"]["boundary"] = str(exc)

    print("=" * 70)
    print("SOURCE 1: OpenChargeMap chargers")
    print("=" * 70)
    try:
        chargers = fetch_chargers(refresh=args.refresh)
        (DATA_DIR / "chargers_bengaluru.json").write_text(json.dumps(chargers, indent=2), encoding="utf-8")
        summary["chargers"] = len(chargers)
    except Exception as exc:  # noqa: BLE001
        print(f"  FAILED: {exc}")
        summary["errors"]["chargers"] = str(exc)
        summary["chargers"] = 0

    print("=" * 70)
    print("SOURCE 2: OSM candidate sites")
    print("=" * 70)
    try:
        candidates = fetch_candidate_sites(refresh=args.refresh)
        (DATA_DIR / "candidate_sites_bengaluru.json").write_text(json.dumps(candidates, indent=2), encoding="utf-8")
        summary["candidate_sites"] = len(candidates)
        by_category: dict[str, int] = {}
        for c in candidates:
            by_category[c["category"]] = by_category.get(c["category"], 0) + 1
        summary["candidate_sites_by_category"] = by_category
    except Exception as exc:  # noqa: BLE001
        print(f"  FAILED: {exc}")
        summary["errors"]["candidate_sites"] = str(exc)
        summary["candidate_sites"] = 0

    print("=" * 70)
    print("SOURCE 2b: localities (place=suburb/neighbourhood)")
    print("=" * 70)
    try:
        localities = fetch_localities(refresh=args.refresh)
        (DATA_DIR / "localities_bengaluru.json").write_text(json.dumps(localities, indent=2), encoding="utf-8")
        summary["localities"] = len(localities)
    except Exception as exc:  # noqa: BLE001
        print(f"  FAILED: {exc}")
        summary["errors"]["localities"] = str(exc)
        summary["localities"] = 0

    print("=" * 70)
    print("SOURCE 3: grid proxy (OSM power infra x BESCOM)")
    print("=" * 70)
    try:
        substations = build_substations_dataset(refresh=args.refresh)
        (DATA_DIR / "substations_bengaluru.json").write_text(json.dumps(substations, indent=2), encoding="utf-8")
        summary["substations"] = len(substations)
        summary["substations_matched_to_bescom"] = sum(1 for s in substations if s.get("matched"))
    except Exception as exc:  # noqa: BLE001
        print(f"  FAILED: {exc}")
        summary["errors"]["substations"] = str(exc)
        summary["substations"] = 0

    print("=" * 70)
    print("SOURCE 4: VAHAN EV registrations")
    print("=" * 70)
    try:
        registrations = fetch_ev_registrations(refresh=args.refresh)
        (DATA_DIR / "ev_registrations_bengaluru.json").write_text(json.dumps(registrations, indent=2), encoding="utf-8")
        summary["ev_registration_rows"] = len(registrations)
        summary["ev_registration_rtos"] = len({r["rto_name"] for r in registrations})
    except Exception as exc:  # noqa: BLE001
        print(f"  FAILED: {exc}")
        summary["errors"]["ev_registrations"] = str(exc)
        summary["ev_registration_rows"] = 0

    print("=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
