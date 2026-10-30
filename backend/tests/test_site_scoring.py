"""Pure unit tests for app.engines.site_scoring -- no DB, no network.

Fixture data in tests/fixtures/bengaluru_sample.json is a static, committed
sample of real records pulled from the Phase A fetch script's output; these
tests never call an API themselves.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.engines.location_search import NameRecord, best_match, search_names
from app.engines.site_scoring import (
    ChargerRef,
    Recommendation,
    SiteScoringInput,
    SubstationRef,
    compute_site_score,
    is_feasible_if_managed,
    recommend,
    score_site,
)

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "bengaluru_sample.json"


@pytest.fixture(scope="module")
def fixture() -> dict:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def _substation_ref(row: dict) -> SubstationRef:
    return SubstationRef(
        id=row["id"],
        name=row["name"],
        latitude=row["latitude"],
        longitude=row["longitude"],
        voltage_kv=row.get("bescom_voltage_class_kv") or (row.get("osm_voltage_kv") or [None])[0],
    )


def _charger_ref(row: dict, source: str = "DEMO") -> ChargerRef:
    return ChargerRef(id=row["id"], name=row["name"], latitude=row["latitude"], longitude=row["longitude"], source=source)


# ---------------------------------------------------------------------------
# 1. Known inputs -> expected site_score (exact weighted-sum arithmetic)
# ---------------------------------------------------------------------------


def test_compute_site_score_known_inputs():
    # weights: demand .40, grid .35, land .15, coverage_gap .10
    score = compute_site_score(
        demand_score=80.0,
        grid_capacity_score=60.0,
        accessibility_score=50.0,
        charger_gap_score=90.0,
    )
    expected = round(0.40 * 80.0 + 0.35 * 60.0 + 0.15 * 50.0 + 0.10 * 90.0, 2)
    assert score == expected == 69.5


def test_score_site_end_to_end_known_inputs():
    data = SiteScoringInput(
        site_id="test-1",
        name="Test Site",
        latitude=12.9352,
        longitude=77.6245,
        poi_density_count=15,  # at reference max -> density_score 100
        land_category="mall",  # category base 80
        citywide_ev_share_pct=25.0,  # at reference max -> multiplier ceiling 1.25
        nearby_chargers=[],  # empty -> coverage_gap 100
        nearest_substation=SubstationRef(id="s1", name="Test Substation", latitude=12.9352, longitude=77.6245, voltage_kv=220.0),
        parking_capacity=300,  # at reference max -> land score 100
        land_area_m2=None,
    )
    result = score_site(data)

    # demand: local = 0.5*100 + 0.5*80 = 90; multiplier at ceiling = 1.25 -> clamped to 100
    assert result.demand_score == 100.0
    # grid: distance 0km -> distance_score 100; voltage 220kv -> table score 100 -> 100
    assert result.grid_capacity_score == 100.0
    # land: parking_capacity 300 == reference max -> 100
    assert result.accessibility_score == 100.0
    # coverage: no chargers -> 100
    assert result.charger_gap_score == 100.0
    assert result.site_score == 100.0
    assert result.recommendation == Recommendation.BUILD.value
    # explanation names the real substation
    assert "Test Substation" in result.explanation


# ---------------------------------------------------------------------------
# 2. Monotonicity: raising demand never lowers site_score
# ---------------------------------------------------------------------------


def test_site_score_monotonic_in_demand():
    scores = [
        compute_site_score(demand_score=d, grid_capacity_score=50.0, accessibility_score=50.0, charger_gap_score=50.0)
        for d in range(0, 101, 10)
    ]
    assert scores == sorted(scores)
    assert scores[-1] > scores[0]


@pytest.mark.parametrize("grid,land,coverage", [(0, 0, 0), (50, 50, 50), (100, 100, 100), (30, 90, 10)])
def test_site_score_monotonic_in_demand_various_fixed_others(grid, land, coverage):
    prev = -1.0
    for demand in range(0, 101, 5):
        score = compute_site_score(demand, grid, land, coverage)
        assert score >= prev
        prev = score


# ---------------------------------------------------------------------------
# 3. Verdict boundaries
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "demand,grid,expected",
    [
        (70, 70, Recommendation.BUILD),
        (70, 40, Recommendation.BUILD_IF_MANAGED),
        (69, 71, Recommendation.DONT_BUILD),  # demand alone gates BUILD/MANAGED even with ample grid
        (100, 39, Recommendation.DONT_BUILD),  # grid gate: high demand can't buy its way past low grid
        (69.9, 69.9, Recommendation.DONT_BUILD),
        (70, 69.9, Recommendation.BUILD_IF_MANAGED),
    ],
)
def test_recommend_boundaries(demand, grid, expected):
    assert recommend(demand, grid) == expected


def test_is_feasible_if_managed_boundary():
    assert is_feasible_if_managed(70, 40) is True
    assert is_feasible_if_managed(70, 39.9) is False
    assert is_feasible_if_managed(69.9, 40) is False


# ---------------------------------------------------------------------------
# 4. Coverage gap varies across real sites -- guards the own-site-charger trap
# ---------------------------------------------------------------------------


def test_coverage_gap_varies_across_sites(fixture):
    koramangala = next(s for s in fixture["sites"] if s["id"] == "site-koramangala")
    mg_road = next(s for s in fixture["sites"] if s["id"] == "site-mg-road")
    all_chargers = fixture["chargers_demo"]

    def other_site_chargers(site_id: str) -> list[ChargerRef]:
        # This is the correct behaviour: exclude the site's own linked
        # charger(s), matching site_service.py's _nearby_chargers().
        return [_charger_ref(c) for c in all_chargers if c["site_id"] != site_id]

    def build(site: dict, chargers: list[ChargerRef]) -> SiteScoringInput:
        return SiteScoringInput(
            site_id=site["id"],
            name=site["name"],
            latitude=site["latitude"],
            longitude=site["longitude"],
            poi_density_count=0,
            land_category="unknown",
            citywide_ev_share_pct=None,
            nearby_chargers=chargers,
            nearest_substation=None,
            parking_capacity=None,
            land_area_m2=None,
        )

    result_a = score_site(build(koramangala, other_site_chargers(koramangala["id"])))
    result_b = score_site(build(mg_road, other_site_chargers(mg_road["id"])))

    assert result_a.charger_gap_score != result_b.charger_gap_score

    # Demonstrate the trap directly: if the caller forgot to exclude each
    # site's own charger (a real bug this guards against -- the demo seed
    # data places every site's own charger ~50-100m away), both sites would
    # see an almost-touching "nearest charger" and a real ~50m difference in
    # the underlying data would stop mattering -- the gap between the two
    # sites' scores collapses compared to the correctly-excluded case.
    own_charger_included = [_charger_ref(c) for c in all_chargers]
    trapped_a = score_site(build(koramangala, own_charger_included))
    trapped_b = score_site(build(mg_road, own_charger_included))
    correct_gap = abs(result_a.charger_gap_score - result_b.charger_gap_score)
    trapped_gap = abs(trapped_a.charger_gap_score - trapped_b.charger_gap_score)
    assert trapped_gap < correct_gap


# ---------------------------------------------------------------------------
# 5. Edge cases
# ---------------------------------------------------------------------------


def test_no_charger_within_radius_gives_max_coverage_gap():
    data = SiteScoringInput(
        site_id="edge-1", name="Edge", latitude=12.9, longitude=77.6,
        poi_density_count=0, land_category="unknown", citywide_ev_share_pct=None,
        nearby_chargers=[], nearest_substation=None, parking_capacity=None, land_area_m2=None,
    )
    factor = score_site(data)
    assert factor.charger_gap_score == 100.0


def test_no_substation_within_radius_gives_zero_grid_score():
    data = SiteScoringInput(
        site_id="edge-2", name="Edge", latitude=12.9, longitude=77.6,
        poi_density_count=0, land_category="unknown", citywide_ev_share_pct=None,
        nearby_chargers=[], nearest_substation=None, parking_capacity=None, land_area_m2=None,
    )
    result = score_site(data)
    assert result.grid_capacity_score == 0.0
    grid_factor = next(f for f in result.factors if f.key == "grid")
    assert "no substation" in grid_factor.detail.lower()
    assert grid_factor.provenance == "ESTIMATED"


def test_missing_osm_tags_falls_back_to_category_baseline():
    data = SiteScoringInput(
        site_id="edge-3", name="Edge", latitude=12.9, longitude=77.6,
        poi_density_count=0, land_category="fuel_station", citywide_ev_share_pct=None,
        nearby_chargers=[], nearest_substation=None, parking_capacity=None, land_area_m2=None,
    )
    result = score_site(data)
    land_factor = next(f for f in result.factors if f.key == "land")
    assert land_factor.provenance == "DERIVED"
    assert "baseline" in land_factor.detail.lower()
    assert result.accessibility_score > 0


def test_empty_candidate_set_does_not_crash():
    # land_category="unknown" and poi_density_count=0 is exactly what
    # site_service.py passes when data/candidate_sites_bengaluru.json has
    # no feature within range (or the file is simply empty/missing).
    data = SiteScoringInput(
        site_id="edge-4", name="Edge", latitude=0.0, longitude=0.0,
        poi_density_count=0, land_category="unknown", citywide_ev_share_pct=None,
        nearby_chargers=[], nearest_substation=None, parking_capacity=None, land_area_m2=None,
    )
    result = score_site(data)
    assert 0.0 <= result.site_score <= 100.0
    assert result.recommendation in {r.value for r in Recommendation}


def test_real_substation_sample_produces_distinct_scores(fixture):
    # Sanity check against actual fetched substation records (not synthetic
    # numbers) -- three different real substations at different distances
    # from Koramangala should not all score identically.
    koramangala = next(s for s in fixture["sites"] if s["id"] == "site-koramangala")
    scores = set()
    for row in fixture["substations"]:
        if row["latitude"] is None:
            continue
        data = SiteScoringInput(
            site_id=koramangala["id"], name=koramangala["name"],
            latitude=koramangala["latitude"], longitude=koramangala["longitude"],
            poi_density_count=0, land_category="unknown", citywide_ev_share_pct=None,
            nearby_chargers=[], nearest_substation=_substation_ref(row),
            parking_capacity=None, land_area_m2=None,
        )
        scores.add(score_site(data).grid_capacity_score)
    assert len(scores) > 1


# ---------------------------------------------------------------------------
# Part 2F -- map-first classification
# ---------------------------------------------------------------------------


def test_coverage_gap_higher_far_from_charger_than_beside_one(fixture):
    """Literal wording from the brief: a point far from any charger scores
    higher coverage_gap than one beside an existing charger. Pure -- two
    SiteScoringInput built directly from the same real charger set."""
    charger = _charger_ref(fixture["chargers_demo"][0])  # real-shaped demo charger

    beside = SiteScoringInput(
        site_id="beside", name="Beside a charger", latitude=charger.latitude, longitude=charger.longitude,
        poi_density_count=0, land_category="unknown", citywide_ev_share_pct=None,
        nearby_chargers=[charger], nearest_substation=None, parking_capacity=None, land_area_m2=None,
    )
    far = SiteScoringInput(
        site_id="far", name="Far from any charger", latitude=charger.latitude + 0.2, longitude=charger.longitude + 0.2,
        poi_density_count=0, land_category="unknown", citywide_ev_share_pct=None,
        nearby_chargers=[charger], nearest_substation=None, parking_capacity=None, land_area_m2=None,
    )

    assert score_site(far).charger_gap_score > score_site(beside).charger_gap_score


def test_name_search_resolves_known_name_to_correct_coordinates(fixture):
    records = [NameRecord(**loc) for loc in fixture["localities"]]
    whitefield = next(loc for loc in fixture["localities"] if loc["name"] == "Whitefield")

    match = best_match("Whitefield", records)

    assert match is not None
    assert match.latitude == whitefield["latitude"]
    assert match.longitude == whitefield["longitude"]


def test_name_search_substring_is_case_insensitive():
    records = [NameRecord(**loc) for loc in [
        {"id": "a", "name": "Koramangala", "latitude": 12.93, "longitude": 77.62, "kind": "locality"},
        {"id": "b", "name": "Jayanagar", "latitude": 12.92, "longitude": 77.58, "kind": "locality"},
    ]]
    results = search_names("KORAMAN", records, limit=8)
    assert [r.id for r in results] == ["a"]


def test_fuzzy_partial_name_returns_sensible_best_match(fixture):
    """A typo/partial input ('korman' for 'Koramangala') should still
    resolve to something reasonable via the fuzzy fallback, not None."""
    records = [NameRecord(**loc) for loc in fixture["localities"]]
    match = best_match("korman", records)
    assert match is not None
    assert match.name == "Koramangala"


def test_out_of_bbox_point_is_rejected():
    from app.services.site_service import BBMP_BBOX, is_within_bbox

    # Well inside the real BBMP bounds (see data/README.md).
    assert is_within_bbox(12.97, 77.59) is True
    # North of Bengaluru entirely -- e.g. roughly Chennai's latitude band.
    assert is_within_bbox(13.5, 77.6) is False
    assert is_within_bbox(12.97, 78.5) is False
    # Exact boundary is inclusive.
    assert is_within_bbox(BBMP_BBOX["min_lat"], BBMP_BBOX["min_lon"]) is True


def test_spatial_index_matches_full_scan():
    """Overview scoring must not skip POIs/substations that a linear scan would find."""
    from app.engines.site_scoring import POI_DENSITY_RADIUS_KM, haversine_km
    from app.services import site_service

    samples = [(12.9716, 77.5946), (12.9352, 77.6245), (13.05, 77.62)]
    candidates = site_service._candidate_sites()
    substations = site_service._substations()
    for lat, lon in samples:
        brute_density = sum(
            1 for c in candidates if haversine_km(lat, lon, c["latitude"], c["longitude"]) <= POI_DENSITY_RADIUS_KM
        )
        assert site_service._poi_density(lat, lon) == brute_density

        brute_subs = [s for s in substations if haversine_km(lat, lon, s["latitude"], s["longitude"]) <= 15.0]
        indexed = site_service._nearest_substation(lat, lon)
        if not brute_subs:
            assert indexed is None
            continue
        brute_best = min(brute_subs, key=lambda s: haversine_km(lat, lon, s["latitude"], s["longitude"]))
        assert indexed is not None
        assert indexed.id == brute_best["id"]


@pytest.mark.db
def test_overview_site_lists_complete_quickly():
    """Regression for Planner Overview axios 10s timeout: scoring 161 sites
    used to full-scan ~2000 OSM POIs per site and hold DB connections."""
    import time

    from sqlalchemy import text

    from app.database.session import SessionLocal
    from app.services import site_service

    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        pytest.skip("DB not reachable in this environment")
        return

    try:
        t0 = time.perf_counter()
        sites = site_service.list_sites(db, limit=50)
        recommended = site_service.list_recommended_sites(db, limit=10)
        elapsed = time.perf_counter() - t0
        assert len(sites) > 0
        assert len(recommended) > 0
        assert elapsed < 5.0, f"Overview scoring took {elapsed:.2f}s"
    finally:
        db.close()


@pytest.mark.db
def test_classify_matches_ranked_list_for_a_seeded_site():
    """The one test in this file that needs a live DB connection (same
    precedent as tests/test_auth_guards.py) -- it's verifying an
    integration invariant (classify() and the ranked-list code path agree on
    the same coordinates) that can't be checked with dataclasses alone.
    Compared against get_site() rather than list_recommended_sites() because
    the latter caps at MAX_RECOMMENDED_LIMIT and an arbitrary seeded site
    isn't guaranteed to be in the top N -- get_site() is the more precise
    proof that classify() and the per-site scoring path are the same code.
    Skips cleanly if the configured DB isn't reachable or unseeded."""
    from sqlalchemy import text

    from app.database.session import SessionLocal
    from app.models.site import Site
    from app.services import site_service

    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        pytest.skip("DB not reachable in this environment")
        return

    try:
        seeded = db.query(Site).first()
        if seeded is None:
            pytest.skip("no seeded sites in this DB -- run seed_demo.py / seed_bengaluru.py first")
            return

        direct = site_service.get_site(db, seeded.id)
        classified = site_service.classify(db, latitude=seeded.latitude, longitude=seeded.longitude, query=None)

        assert classified.site_score == direct.site_score
        assert classified.recommendation == direct.recommendation
        assert classified.demand_score == direct.demand_score
        assert classified.grid_capacity_score == direct.grid_capacity_score
        assert classified.nearest_candidate is not None
        assert classified.nearest_candidate.id == seeded.id
        assert classified.nearest_candidate.distance_km == 0.0
    finally:
        db.close()
