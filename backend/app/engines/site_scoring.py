"""Pure scoring engine for candidate EV charging sites.

No FastAPI, no SQLAlchemy, no network calls -- everything here is plain
dataclasses in, a scored result out, so it's unit-testable in isolation
(see backend/tests/test_site_scoring.py) and swappable: when a teammate's
real demand or grid model lands, only the caller that builds
SiteScoringInput needs to change (backend/app/services/site_service.py).
This module never changes to accommodate a new data source -- only what
feeds it does.

Every sub-score is tagged with how confident we actually are in it:
  REAL       measured from real, current data (haversine to a real charger,
             an OSM-tagged parking capacity)
  DERIVED    computed from real data through a documented formula, not
             measured directly (POI density scaled by EV registrations)
  ESTIMATED  a documented proxy standing in for data that isn't public
             (grid feeder headroom -- BESCOM doesn't publish this; distance
             to the nearest substation is used instead, and the explanation
             says so explicitly)
  DEMO       placeholder, not real -- used only while a real source (e.g.
             OpenChargeMap, blocked on an API key as of this writing) hasn't
             been fetched yet. See site_service.py's fallback.

A planner tool that overstates its data confidence is worse than no tool, so
these labels are load-bearing: they travel all the way to the API response
and are shown next to every sub-score in the UI.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum

# ---------------------------------------------------------------------------
# Enums -- exact string values matter. frontend/src/utils/recommendations.ts
# keys colours, labels and copy off Recommendation; do not rename these.
# ---------------------------------------------------------------------------


class Recommendation(str, Enum):
    BUILD = "BUILD"
    BUILD_IF_MANAGED = "BUILD_IF_MANAGED"
    DONT_BUILD = "DONT_BUILD"


class Provenance(str, Enum):
    REAL = "REAL"
    DERIVED = "DERIVED"
    ESTIMATED = "ESTIMATED"
    DEMO = "DEMO"


# ---------------------------------------------------------------------------
# Weights -- the ONE place these are defined. app/engines/recommendation.py
# delegates to this module rather than redefining them.
# ---------------------------------------------------------------------------

SCORE_WEIGHTS: dict[str, float] = {
    "demand": 0.40,
    "grid": 0.35,
    "land": 0.15,
    "coverage_gap": 0.10,
}
assert abs(sum(SCORE_WEIGHTS.values()) - 1.0) < 1e-9, "SCORE_WEIGHTS must sum to 1.0"

# Grid is a hard GATE as well as a weighted term: below MIN_GRID_FOR_MANAGED,
# no amount of demand earns BUILD or BUILD_IF_MANAGED. See recommend().
MIN_GRID_FOR_BUILD = 70.0
MIN_GRID_FOR_MANAGED = 40.0
MIN_DEMAND_FOR_BUILD = 70.0
MIN_DEMAND_FOR_MANAGED = 70.0

# ---------------------------------------------------------------------------
# Fixed reference ranges for normalising sub-scores to 0-100.
#
# These are chosen once and documented here -- NEVER derived from the
# current candidate set's min/max. Per-request min-max normalisation would
# silently reshuffle every ranking each time a candidate is added or
# removed, which matters a lot more once the candidate set is hundreds of
# real OSM features instead of 10 hand-picked demo points.
# ---------------------------------------------------------------------------

# -- demand: POI density + category baseline, scaled by citywide EV share --
POI_DENSITY_RADIUS_KM = 0.75
POI_DENSITY_REFERENCE_MAX = 15  # candidates within radius -> full density score

# How much passing EV traffic a place like this tends to see. Real
# distinguishing signal is OSM's road-classification tags (highway=trunk vs
# residential etc); Phase A's fetch script does not pull those yet, so this
# baseline is a documented simplification, not a measurement -- see the
# "demand" ScoredFactor's provenance (DERIVED) and detail string.
CATEGORY_DEMAND_BASE: dict[str, float] = {
    "metro_station": 85.0,
    "bus_station": 75.0,
    "mall": 80.0,
    "fuel_station": 60.0,
    "parking": 55.0,
    "unknown": 40.0,
}

EV_SHARE_REFERENCE_MAX_PCT = 25.0  # 25% EV share in VAHAN registrations -> ceiling multiplier
EV_SHARE_MULTIPLIER_RANGE = (0.85, 1.25)  # floor at ~0% adoption, ceiling at reference max

# -- grid: distance to nearest substation + its voltage class --
SUBSTATION_DISTANCE_REFERENCE_KM = 5.0  # 0 km -> 100, >= 5 km -> 0
VOLTAGE_SCORE_TABLE: list[tuple[float, float]] = [  # (min_kv, score); highest matching band wins
    (200.0, 100.0),
    (100.0, 80.0),
    (60.0, 65.0),
    (30.0, 50.0),
    (0.0, 35.0),
]
GRID_DISTANCE_WEIGHT = 0.6
GRID_VOLTAGE_WEIGHT = 0.4

# -- coverage_gap: distance to / density of EXISTING chargers, excluding
#    the site's own -- see the CRITICAL TRAP note on ChargerRef below --
COVERAGE_RADIUS_KM = 2.0
COVERAGE_DISTANCE_REFERENCE_KM = 3.0  # >= 3 km to nearest charger -> full gap score from distance
COVERAGE_COUNT_REFERENCE = 5  # >= 5 chargers within COVERAGE_RADIUS_KM -> zero contribution from count
COVERAGE_DISTANCE_WEIGHT = 0.7
COVERAGE_COUNT_WEIGHT = 0.3

# -- land: OSM-tagged parking capacity / polygon footprint, else category --
PARKING_CAPACITY_REFERENCE_MAX = 300  # spaces -> full score
LAND_AREA_REFERENCE_MAX_M2 = 5000.0  # square metres -> full score
LAND_CATEGORY_BASE: dict[str, float] = {
    "mall": 80.0,
    "bus_station": 70.0,
    "metro_station": 75.0,
    "fuel_station": 55.0,
    "parking": 60.0,
    "unknown": 35.0,
}

EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


# ---------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ChargerRef:
    """An existing charger to measure coverage against.

    CRITICAL: when built from the `chargers` table, this list must exclude
    the candidate site's own linked charger(s) (charger.site_id == site.id).
    The demo seed data places each site's own charger ~50-100m away, so
    including it makes every site's nearest-charger distance identical and
    the whole coverage_gap sub-score collapses to one value -- see
    test_site_scoring.py::test_coverage_gap_varies_across_sites.
    """

    id: str
    name: str
    latitude: float
    longitude: float
    source: str = "OCM"  # "OCM" (real) or "DEMO" (placeholder, until Phase A's OCM fetch is unblocked)


@dataclass(frozen=True)
class SubstationRef:
    id: str
    name: str | None
    latitude: float
    longitude: float
    voltage_kv: float | None


@dataclass(frozen=True)
class SiteScoringInput:
    site_id: str
    name: str
    latitude: float
    longitude: float
    poi_density_count: int  # real candidate sites of any category within POI_DENSITY_RADIUS_KM
    land_category: str  # one of CATEGORY_DEMAND_BASE / LAND_CATEGORY_BASE keys; "unknown" if no match
    citywide_ev_share_pct: float | None  # real, from VAHAN via OpenCity; None if unavailable
    nearby_chargers: list[ChargerRef]  # already excludes this site's own charger(s) -- see ChargerRef
    nearest_substation: SubstationRef | None
    parking_capacity: int | None  # real, OSM-tagged
    land_area_m2: float | None  # real, computed from OSM polygon geometry


# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ScoredFactor:
    key: str
    label: str
    score: float  # 0-100
    weight: float
    contribution: float  # score * weight, already rounded
    provenance: str  # a Provenance value
    detail: str  # human-readable, names real places/numbers


@dataclass(frozen=True)
class SiteScoringResult:
    site_id: str
    demand_score: float
    grid_capacity_score: float
    accessibility_score: float  # = land availability -- reuses the existing column/field name
    charger_gap_score: float  # = coverage gap -- reuses the existing column/field name
    site_score: float
    recommendation: str  # a Recommendation value
    factors: list[ScoredFactor]
    explanation: str


# ---------------------------------------------------------------------------
# Sub-scores
# ---------------------------------------------------------------------------


def _score_demand(data: SiteScoringInput) -> ScoredFactor:
    density_score = _clamp(100 * data.poi_density_count / POI_DENSITY_REFERENCE_MAX)
    category_base = CATEGORY_DEMAND_BASE.get(data.land_category, CATEGORY_DEMAND_BASE["unknown"])
    local_score = _clamp(0.5 * density_score + 0.5 * category_base)

    if data.citywide_ev_share_pct is None:
        multiplier = 1.0
        ev_detail = "citywide EV registration share unavailable"
    else:
        frac = _clamp(data.citywide_ev_share_pct / EV_SHARE_REFERENCE_MAX_PCT, 0.0, 1.0)
        lo, hi = EV_SHARE_MULTIPLIER_RANGE
        multiplier = lo + frac * (hi - lo)
        ev_detail = f"citywide EV registration share {data.citywide_ev_share_pct:.1f}% (VAHAN, latest year)"

    score = _clamp(local_score * multiplier)
    category_label = data.land_category.replace("_", " ")
    detail = (
        f"{data.poi_density_count} POIs within {POI_DENSITY_RADIUS_KM:.2f} km "
        f"({category_label} baseline), {ev_detail}"
    )
    return ScoredFactor(
        key="demand",
        label="Traffic demand",
        score=round(score, 1),
        weight=SCORE_WEIGHTS["demand"],
        contribution=round(score * SCORE_WEIGHTS["demand"], 2),
        provenance=Provenance.DERIVED.value,
        detail=detail,
    )


def _voltage_score(voltage_kv: float | None) -> float:
    if voltage_kv is None:
        return VOLTAGE_SCORE_TABLE[-1][1]
    for min_kv, score in VOLTAGE_SCORE_TABLE:
        if voltage_kv >= min_kv:
            return score
    return VOLTAGE_SCORE_TABLE[-1][1]


def _score_grid(data: SiteScoringInput) -> ScoredFactor:
    sub = data.nearest_substation
    if sub is None:
        return ScoredFactor(
            key="grid",
            label="Grid readiness",
            score=0.0,
            weight=SCORE_WEIGHTS["grid"],
            contribution=0.0,
            provenance=Provenance.ESTIMATED.value,
            detail="no substation found in the loaded dataset near this site -- treated as zero headroom, not measured",
        )
    dist_km = haversine_km(data.latitude, data.longitude, sub.latitude, sub.longitude)
    distance_score = _clamp(100 * (1 - dist_km / SUBSTATION_DISTANCE_REFERENCE_KM))
    voltage_score = _voltage_score(sub.voltage_kv)
    score = _clamp(GRID_DISTANCE_WEIGHT * distance_score + GRID_VOLTAGE_WEIGHT * voltage_score)
    voltage_label = f"{sub.voltage_kv:.0f} kV" if sub.voltage_kv else "unknown voltage"
    name = sub.name or "unnamed substation"
    detail = (
        f"{voltage_label} substation {dist_km:.1f} km away ({name}) -- ESTIMATED from distance and "
        f"voltage class, not measured feeder headroom (not public data)"
    )
    return ScoredFactor(
        key="grid",
        label="Grid readiness",
        score=round(score, 1),
        weight=SCORE_WEIGHTS["grid"],
        contribution=round(score * SCORE_WEIGHTS["grid"], 2),
        provenance=Provenance.ESTIMATED.value,
        detail=detail,
    )


def _score_coverage_gap(data: SiteScoringInput) -> ScoredFactor:
    chargers = data.nearby_chargers
    if not chargers:
        score = 100.0
        source = "OCM"
        detail = "no other chargers found in the loaded dataset -- maximum coverage gap"
    else:
        distances = sorted(
            ((haversine_km(data.latitude, data.longitude, c.latitude, c.longitude), c) for c in chargers),
            key=lambda pair: pair[0],
        )
        nearest_km, nearest = distances[0]
        count_in_radius = sum(1 for d, _ in distances if d <= COVERAGE_RADIUS_KM)
        distance_score = _clamp(100 * min(nearest_km, COVERAGE_DISTANCE_REFERENCE_KM) / COVERAGE_DISTANCE_REFERENCE_KM)
        count_score = _clamp(100 * (1 - count_in_radius / COVERAGE_COUNT_REFERENCE))
        score = _clamp(COVERAGE_DISTANCE_WEIGHT * distance_score + COVERAGE_COUNT_WEIGHT * count_score)
        source = nearest.source
        detail = f"nearest charger {nearest_km:.1f} km away ({nearest.name}), {count_in_radius} within {COVERAGE_RADIUS_KM:.0f} km"

    provenance = Provenance.REAL.value if source == "OCM" else Provenance.DEMO.value
    if provenance == Provenance.DEMO.value:
        detail += " -- OpenChargeMap not loaded yet, using placeholder demo charger locations"
    return ScoredFactor(
        key="coverage_gap",
        label="Coverage gap",
        score=round(score, 1),
        weight=SCORE_WEIGHTS["coverage_gap"],
        contribution=round(score * SCORE_WEIGHTS["coverage_gap"], 2),
        provenance=provenance,
        detail=detail,
    )


def _score_land(data: SiteScoringInput) -> ScoredFactor:
    category_label = data.land_category.replace("_", " ")
    if data.parking_capacity:
        score = _clamp(100 * data.parking_capacity / PARKING_CAPACITY_REFERENCE_MAX)
        provenance = Provenance.REAL.value
        detail = f"{data.parking_capacity}-space parking (OSM-tagged capacity)"
    elif data.land_area_m2:
        score = _clamp(100 * data.land_area_m2 / LAND_AREA_REFERENCE_MAX_M2)
        provenance = Provenance.REAL.value
        detail = f"{data.land_area_m2:,.0f} m² footprint (OSM polygon area)"
    else:
        score = LAND_CATEGORY_BASE.get(data.land_category, LAND_CATEGORY_BASE["unknown"])
        provenance = Provenance.DERIVED.value
        detail = f"no capacity or area tagged in OSM -- category baseline for {category_label}"
    return ScoredFactor(
        key="land",
        label="Land availability",
        score=round(score, 1),
        weight=SCORE_WEIGHTS["land"],
        contribution=round(score * SCORE_WEIGHTS["land"], 2),
        provenance=provenance,
        detail=detail,
    )


# ---------------------------------------------------------------------------
# Weighted sum, gate, verdict, explanation, and the top-level entry point
# ---------------------------------------------------------------------------


def compute_site_score(
    demand_score: float,
    grid_capacity_score: float,
    accessibility_score: float,
    charger_gap_score: float,
) -> float:
    """Transparent weighted sum. Parameter names match the pre-existing
    `sites` table columns (see backend/app/models/site.py) even though the
    semantics have moved on: accessibility_score now carries land
    availability, charger_gap_score now carries coverage gap. Renaming the
    API-facing fields would ripple into frontend/src/types/index.ts for no
    benefit, so the names stay; see site_scoring's module docstring.
    """
    score = (
        SCORE_WEIGHTS["demand"] * demand_score
        + SCORE_WEIGHTS["grid"] * grid_capacity_score
        + SCORE_WEIGHTS["land"] * accessibility_score
        + SCORE_WEIGHTS["coverage_gap"] * charger_gap_score
    )
    return round(score, 2)


def is_feasible_if_managed(demand_score: float, grid_score: float) -> bool:
    """Whether load management could plausibly make a grid-constrained site
    workable.

    TODO(grid-team): this is a static threshold, not a simulation. Replace
    the body with a real time-of-day load-shift / demand-response model when
    one exists. Do not fake a scheduling simulation here in the meantime --
    a threshold that says so honestly is better than a fabricated one that
    doesn't.
    """
    return demand_score >= MIN_DEMAND_FOR_MANAGED and grid_score >= MIN_GRID_FOR_MANAGED


def recommend(demand_score: float, grid_score: float) -> Recommendation:
    """Grid is a GATE, not just a weighted term: below MIN_GRID_FOR_MANAGED,
    no demand score reaches BUILD or BUILD_IF_MANAGED."""
    if demand_score >= MIN_DEMAND_FOR_BUILD and grid_score >= MIN_GRID_FOR_BUILD:
        return Recommendation.BUILD
    if is_feasible_if_managed(demand_score, grid_score):
        return Recommendation.BUILD_IF_MANAGED
    return Recommendation.DONT_BUILD


def recommend_site(demand_score: float, grid_capacity_score: float) -> Recommendation:
    """Alias kept for the exact call signature app/engines/recommendation.py
    (and, historically, site_service.py) used against the old placeholder
    engine."""
    return recommend(demand_score, grid_capacity_score)


_VERDICT_LEAD = {
    Recommendation.BUILD: "Demand and grid readiness both clear the bar.",
    Recommendation.BUILD_IF_MANAGED: "Demand clears the bar; grid needs load management.",
    Recommendation.DONT_BUILD: "Demand or grid readiness falls short of the bar.",
}


def _build_explanation(verdict: Recommendation, factors: list[ScoredFactor]) -> str:
    lead = _VERDICT_LEAD[verdict]
    facts = "; ".join(f.detail for f in factors)
    return f"{lead} {facts}."


def score_site(data: SiteScoringInput) -> SiteScoringResult:
    demand = _score_demand(data)
    grid = _score_grid(data)
    land = _score_land(data)
    coverage = _score_coverage_gap(data)
    factors = [demand, grid, land, coverage]

    site_score = compute_site_score(demand.score, grid.score, land.score, coverage.score)
    verdict = recommend(demand.score, grid.score)

    return SiteScoringResult(
        site_id=data.site_id,
        demand_score=demand.score,
        grid_capacity_score=grid.score,
        accessibility_score=land.score,
        charger_gap_score=coverage.score,
        site_score=site_score,
        recommendation=verdict.value,
        factors=factors,
        explanation=_build_explanation(verdict, factors),
    )
