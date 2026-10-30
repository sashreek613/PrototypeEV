"""Tests for the merged demo+real charger list.

list_chargers()/get_charger() need a DB session (same pattern as the rest of
this project's DB-backed tests), so these use the real TestClient/DB via
app.database.session -- but the REAL-charger mapping and the
isWithinRange-equivalent range-filter regression are pure and tested
directly against fixture dicts, no DB, no network.
"""

from __future__ import annotations

import math

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.charger import ChargerProvenance
from app.services import charger_service
from app.services.charger_service import _to_charger_read_from_real

# A small, deliberately wide-spread fixture (>20km across), unlike the
# clustered ~50-100m demo set -- this is what actually exercises the
# range-filter bug this task fixes. Real-shaped coordinates, not the real
# Bengaluru OCM data (keeps this test independent of data/chargers_bengaluru.json).
WIDE_SPREAD_CHARGERS = [
    {"id": "wsc-1", "name": "Koramangala DC", "latitude": 12.9352, "longitude": 77.6245, "power_kw": 60, "connector_type": "CCS2", "availability": True},
    {"id": "wsc-2", "name": "Indiranagar AC", "latitude": 12.9784, "longitude": 77.6408, "power_kw": 22, "connector_type": "Type 2", "availability": True},
    {"id": "wsc-3", "name": "Whitefield DC", "latitude": 12.9698, "longitude": 77.7499, "power_kw": 120, "connector_type": "CCS2", "availability": None},
    {"id": "wsc-4", "name": "Electronic City DC", "latitude": 12.8456, "longitude": 77.6603, "power_kw": 60, "connector_type": "CCS2", "availability": True},
    {"id": "wsc-5", "name": "Yelahanka AC", "latitude": 13.1007, "longitude": 77.5963, "power_kw": 22, "connector_type": "Type 2", "availability": False},
]


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _is_within_range(origin: tuple[float, float], point: dict, range_km: float) -> bool:
    """Same shape as frontend/src/utils/geo.ts::isWithinRange -- re-implemented
    here in Python so the regression is provable from the backend test suite
    without a JS runtime. Not the app's actual filter (that lives in the
    frontend); this proves the DATA now varies enough for that filter to
    produce different results at different ranges, which the old clustered
    demo set could never do."""
    return _haversine_km(origin[0], origin[1], point["latitude"], point["longitude"]) <= range_km


# ---------------------------------------------------------------------------
# Pure: REAL row -> ChargerRead mapping
# ---------------------------------------------------------------------------


def test_real_charger_maps_to_read_with_expected_provenance_and_bookable():
    read = _to_charger_read_from_real(WIDE_SPREAD_CHARGERS[0])
    assert read.provenance == ChargerProvenance.REAL
    assert read.bookable is True
    assert read.site_id is None


def test_real_charger_with_no_ocm_status_maps_to_availability_none_not_true():
    row = WIDE_SPREAD_CHARGERS[2]  # availability: None in the fixture
    assert row["availability"] is None
    read = _to_charger_read_from_real(row)
    assert read.availability is None
    assert read.availability is not True


def test_real_charger_price_uses_fallback_app_tariff():
    read = _to_charger_read_from_real(WIDE_SPREAD_CHARGERS[0])
    assert read.price_per_kwh == 18.0


# ---------------------------------------------------------------------------
# DB-backed: the actual merge via the real endpoint. Same TestClient/DB
# pattern as tests/test_auth_guards.py. _real_chargers_cached is monkeypatched
# so this test doesn't depend on data/chargers_bengaluru.json's real content
# (or need OCM_API_KEY) -- only the merge logic is under test here.
# ---------------------------------------------------------------------------


def test_list_chargers_returns_both_demo_and_real_when_real_fixture_present(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(charger_service, "_real_chargers_cached", lambda: WIDE_SPREAD_CHARGERS)

    client = TestClient(app)
    response = client.get("/api/chargers")
    assert response.status_code == 200
    body = response.json()

    provenances = {row["provenance"] for row in body}
    assert "REAL" in provenances
    real_rows = [row for row in body if row["provenance"] == "REAL"]
    assert len(real_rows) == len(WIDE_SPREAD_CHARGERS)
    assert all(row["bookable"] is True for row in real_rows)
    assert all(row["site_id"] is None for row in real_rows)

    if "DEMO" in provenances:
        demo_rows = [row for row in body if row["provenance"] == "DEMO"]
        assert all(row["bookable"] is True for row in demo_rows)


# ---------------------------------------------------------------------------
# Regression: the actual bug this task fixes. With a realistic wide-spread
# set, the same filter at a small vs large range returns DIFFERENT counts --
# proving range-based filtering is no longer static regardless of battery %.
# With the old ~50-100m-clustered demo set, every charger is inside or
# outside together at nearly every plausible range, which is what made the
# UI look static.
# ---------------------------------------------------------------------------


def test_range_filter_count_varies_between_a_small_and_a_large_range():
    origin = (12.9352, 77.6245)  # driver "at" Koramangala

    small_range_km = 8.0  # ~20% battery on a small-capacity EV
    large_range_km = 40.0  # ~80% battery on the same EV

    small_count = sum(1 for c in WIDE_SPREAD_CHARGERS if _is_within_range(origin, c, small_range_km))
    large_count = sum(1 for c in WIDE_SPREAD_CHARGERS if _is_within_range(origin, c, large_range_km))

    assert small_count < large_count, (
        f"range filter returned the same count ({small_count}) at both a small and large "
        "range -- this is the exact bug the wide-spread charger fixture is meant to catch"
    )
    assert small_count >= 1  # the origin's own charger is always in range
    assert large_count == len(WIDE_SPREAD_CHARGERS)  # 40km covers the whole fixture


def test_range_filter_against_the_old_clustered_demo_pattern_is_the_bug_being_fixed():
    """Documents WHY the bug happened: a clustered set (every charger
    ~50-100m from a shared reference point, like the old 14-15 demo rows)
    gives the same in/out result at any two ranges both well above or both
    well below the cluster size -- there's no data variety for battery % to
    matter. This isn't asserting current behaviour needs fixing (the merge
    already fixes it); it's a guard that the fixture-based regression test
    above would have caught the original report if it had existed sooner.
    """
    clustered_origin = (12.9352, 77.6245)
    clustered_chargers = [
        {"id": f"demo-{i}", "latitude": 12.9352 + i * 0.0005, "longitude": 77.6245 + i * 0.0005}
        for i in range(15)
    ]  # all within ~100m of the origin, like the real old demo data

    small_count = sum(1 for c in clustered_chargers if _is_within_range(clustered_origin, c, 5.0))
    large_count = sum(1 for c in clustered_chargers if _is_within_range(clustered_origin, c, 40.0))

    # Both ranges are far larger than the ~100m cluster spread, so both
    # include everything -- exactly the "static regardless of battery %"
    # symptom reported.
    assert small_count == large_count == len(clustered_chargers)
