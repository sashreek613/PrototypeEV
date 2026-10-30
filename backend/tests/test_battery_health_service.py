"""Pure unit tests for app.services.battery_health_service -- no DB, no
network, no wall-clock dependency (a fixed `today` is always passed)."""

from __future__ import annotations

import datetime as dt

import pytest

from app.services.battery_health_service import (
    MIN_HEALTH_MULTIPLIER,
    estimate_battery_health,
)

TODAY = dt.date(2026, 8, 25)


def test_none_registration_date_is_a_documented_no_op():
    multiplier, detail = estimate_battery_health(None, today=TODAY)
    assert multiplier == 1.0
    assert "not on file" in detail


def test_registered_today_has_no_adjustment():
    multiplier, detail = estimate_battery_health(TODAY, today=TODAY)
    assert multiplier == 1.0


def test_future_registration_date_has_no_adjustment():
    # Defensive: a bad/clock-skewed input must never produce a >1.0 multiplier.
    multiplier, _ = estimate_battery_health(TODAY + dt.timedelta(days=30), today=TODAY)
    assert multiplier == 1.0


def test_one_year_old_vehicle_loses_the_documented_first_year_fraction():
    # 365 days is fractionally short of a full 365.25-day year -- use that
    # exact span so the multiplier lands on the documented 5% boundary.
    one_year_ago = TODAY - dt.timedelta(days=365)
    multiplier, detail = estimate_battery_health(one_year_ago, today=TODAY)
    assert multiplier == pytest.approx(0.95, abs=0.001)
    assert "days old" in detail or "years old" in detail


def test_degradation_is_monotonically_non_increasing_with_age():
    ages_days = [0, 30, 180, 365, 365 * 2, 365 * 5, 365 * 10, 365 * 30]
    multipliers = [estimate_battery_health(TODAY - dt.timedelta(days=d), today=TODAY)[0] for d in ages_days]
    for earlier, later in zip(multipliers, multipliers[1:]):
        assert later <= earlier


def test_very_old_vehicle_floors_at_documented_minimum():
    ancient = TODAY - dt.timedelta(days=365 * 50)
    multiplier, _ = estimate_battery_health(ancient, today=TODAY)
    assert multiplier == MIN_HEALTH_MULTIPLIER


def test_multiplier_never_exceeds_one_or_drops_below_floor():
    for years in range(0, 60):
        d = TODAY - dt.timedelta(days=365 * years)
        multiplier, _ = estimate_battery_health(d, today=TODAY)
        assert MIN_HEALTH_MULTIPLIER <= multiplier <= 1.0
