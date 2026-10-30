"""Pure unit tests for app.services.range_service -- no DB, no network.

Temperature tests either call _temperature_multiplier() directly (pure, no
network at all) or monkeypatch _fetch_temperature_c so calculate_range's
lat/lon path is exercised without ever hitting Open-Meteo.
"""

from __future__ import annotations

import math

import pytest

from app.services import range_service
from app.services.range_service import (
    CLIMATE_CONTROL_MULTIPLIER,
    COMFORTABLE_TEMP_MAX_C,
    COMFORTABLE_TEMP_MIN_C,
    DRIVING_PROFILE_MULTIPLIERS,
    RESERVE_BATTERY_PCT,
    _temperature_multiplier,
    calculate_range,
)


def test_reserve_buffer_reduces_range_by_documented_amount():
    result = calculate_range(battery_capacity_kwh=40.0, current_battery_pct=100.0, efficiency_wh_km=150.0)

    # 100% -> 40 kWh -> 40/0.15 = 266.7 km raw
    assert result.estimated_range_km == pytest.approx(266.7, abs=0.1)
    # Buffered pct = 100 - RESERVE_BATTERY_PCT -> same ratio applied to range
    expected_buffered = round(result.estimated_range_km * (100 - RESERVE_BATTERY_PCT) / 100, 1)
    assert result.buffered_range_km == pytest.approx(expected_buffered, abs=0.2)
    assert result.buffered_range_km < result.estimated_range_km
    assert result.reserve_pct == RESERVE_BATTERY_PCT


def test_reserve_buffer_value_is_the_documented_10_percent():
    # Pin the actual documented number -- if this changes, it should be a
    # deliberate edit to RESERVE_BATTERY_PCT, not an accidental regression.
    assert RESERVE_BATTERY_PCT == 10.0


def test_zero_battery_pct_returns_zero_range_not_divide_by_zero():
    result = calculate_range(battery_capacity_kwh=40.0, current_battery_pct=0.0, efficiency_wh_km=150.0)

    assert result.available_kwh == 0.0
    assert result.estimated_range_km == 0.0
    assert result.buffered_range_km == 0.0


def test_battery_pct_at_or_below_reserve_gives_zero_buffered_range():
    # At exactly the reserve threshold, buffered range must not go negative.
    result = calculate_range(battery_capacity_kwh=40.0, current_battery_pct=RESERVE_BATTERY_PCT, efficiency_wh_km=150.0)
    assert result.buffered_range_km == 0.0
    assert result.estimated_range_km > 0.0  # raw range is still meaningful at 10%

    below_reserve = calculate_range(battery_capacity_kwh=40.0, current_battery_pct=5.0, efficiency_wh_km=150.0)
    assert below_reserve.buffered_range_km == 0.0


def test_battery_pct_is_clamped_to_0_100():
    over = calculate_range(battery_capacity_kwh=40.0, current_battery_pct=150.0, efficiency_wh_km=150.0)
    assert over.current_battery_pct == 100.0

    under = calculate_range(battery_capacity_kwh=40.0, current_battery_pct=-20.0, efficiency_wh_km=150.0)
    assert under.current_battery_pct == 0.0
    assert under.estimated_range_km == 0.0


def test_zero_efficiency_falls_back_to_default_instead_of_dividing_by_zero():
    result = calculate_range(battery_capacity_kwh=40.0, current_battery_pct=100.0, efficiency_wh_km=0.0)
    assert result.estimated_range_km > 0.0
    assert result.buffered_range_km > 0.0


def test_range_scales_with_efficiency():
    efficient = calculate_range(battery_capacity_kwh=40.0, current_battery_pct=100.0, efficiency_wh_km=100.0)
    inefficient = calculate_range(battery_capacity_kwh=40.0, current_battery_pct=100.0, efficiency_wh_km=200.0)
    assert efficient.estimated_range_km > inefficient.estimated_range_km
    assert efficient.buffered_range_km > inefficient.buffered_range_km


# ---------------------------------------------------------------------------
# Multi-factor range: temperature, climate control, driving profile
# ---------------------------------------------------------------------------


def test_omitting_all_three_optional_params_reproduces_existing_output_exactly():
    """No regression for old callers -- byte-identical to the pre-multi-factor
    behaviour, since every default multiplier is a no-op (1.0)."""
    old_style = calculate_range(battery_capacity_kwh=40.0, current_battery_pct=72.0, efficiency_wh_km=145.0)
    explicit_defaults = calculate_range(
        battery_capacity_kwh=40.0,
        current_battery_pct=72.0,
        efficiency_wh_km=145.0,
        latitude=None,
        longitude=None,
        climate_control=False,
        driving_profile="mixed",
    )
    assert old_style.estimated_range_km == explicit_defaults.estimated_range_km
    assert old_style.buffered_range_km == explicit_defaults.buffered_range_km
    assert len(old_style.factors) == 4
    assert all(f.multiplier == 1.0 for f in old_style.factors)


@pytest.mark.parametrize(
    "temp_c,expected_multiplier",
    [
        (-10.0, 0.70),  # below freezing
        (5.0, 0.85),  # cool
        (COMFORTABLE_TEMP_MIN_C, 1.0),  # comfortable band, inclusive lower bound
        (25.0, 1.0),  # comfortable
        (COMFORTABLE_TEMP_MAX_C, 1.0),  # comfortable band, inclusive upper bound
        (40.0, 0.90),  # hot
        (50.0, 0.85),  # extreme heat
    ],
)
def test_temperature_multiplier_bands(temp_c, expected_multiplier):
    multiplier, detail = _temperature_multiplier(temp_c)
    assert multiplier == expected_multiplier
    assert f"{temp_c:.1f}" in detail


def test_temperature_adjustment_changes_buffered_range_by_documented_amount(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(range_service, "_fetch_temperature_c", lambda lat, lon: -10.0)

    baseline = calculate_range(battery_capacity_kwh=40.0, current_battery_pct=100.0, efficiency_wh_km=150.0)
    cold = calculate_range(battery_capacity_kwh=40.0, current_battery_pct=100.0, efficiency_wh_km=150.0, latitude=12.97, longitude=77.59)

    assert cold.buffered_range_km == pytest.approx(baseline.buffered_range_km * 0.70, abs=0.2)
    temp_factor = next(f for f in cold.factors if f.key == "temperature")
    assert temp_factor.multiplier == 0.70


def test_temperature_fetch_failure_degrades_to_no_adjustment(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(range_service, "_fetch_temperature_c", lambda lat, lon: None)

    result = calculate_range(battery_capacity_kwh=40.0, current_battery_pct=100.0, efficiency_wh_km=150.0, latitude=12.97, longitude=77.59)
    temp_factor = next(f for f in result.factors if f.key == "temperature")
    assert temp_factor.multiplier == 1.0
    assert "not available" in temp_factor.detail


def test_climate_control_reduces_range_by_documented_amount():
    off = calculate_range(battery_capacity_kwh=40.0, current_battery_pct=100.0, efficiency_wh_km=150.0, climate_control=False)
    on = calculate_range(battery_capacity_kwh=40.0, current_battery_pct=100.0, efficiency_wh_km=150.0, climate_control=True)

    assert on.buffered_range_km == pytest.approx(off.buffered_range_km * CLIMATE_CONTROL_MULTIPLIER, abs=0.2)
    assert on.buffered_range_km < off.buffered_range_km


@pytest.mark.parametrize("profile", ["city", "mixed", "highway"])
def test_driving_profile_changes_range_in_documented_direction(profile):
    mixed = calculate_range(battery_capacity_kwh=40.0, current_battery_pct=100.0, efficiency_wh_km=150.0, driving_profile="mixed")
    result = calculate_range(battery_capacity_kwh=40.0, current_battery_pct=100.0, efficiency_wh_km=150.0, driving_profile=profile)

    expected_multiplier = DRIVING_PROFILE_MULTIPLIERS[profile]
    assert result.buffered_range_km == pytest.approx(mixed.buffered_range_km * expected_multiplier, abs=0.2)

    if profile == "city":
        assert result.buffered_range_km > mixed.buffered_range_km  # regen braking bonus
    elif profile == "highway":
        assert result.buffered_range_km < mixed.buffered_range_km  # drag penalty
    else:
        assert result.buffered_range_km == mixed.buffered_range_km  # mixed is the baseline, unchanged


def test_unknown_driving_profile_falls_back_to_no_adjustment():
    result = calculate_range(battery_capacity_kwh=40.0, current_battery_pct=100.0, efficiency_wh_km=150.0, driving_profile="not-a-real-profile")
    profile_factor = next(f for f in result.factors if f.key == "driving_profile")
    assert profile_factor.multiplier == 1.0


def test_factors_breakdown_reconciles_with_final_buffered_range(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(range_service, "_fetch_temperature_c", lambda lat, lon: 40.0)  # hot -> 0.90

    result = calculate_range(
        battery_capacity_kwh=40.0,
        current_battery_pct=100.0,
        efficiency_wh_km=150.0,
        latitude=12.97,
        longitude=77.59,
        climate_control=True,
        driving_profile="highway",
    )

    combined = math.prod(f.multiplier for f in result.factors)
    unbuffered_base_pct = (100.0 - RESERVE_BATTERY_PCT) / 100.0
    expected_base_buffered = (40.0 * unbuffered_base_pct) / (150.0 / 1000.0)
    assert result.buffered_range_km == pytest.approx(round(expected_base_buffered * combined, 1), abs=0.15)
    assert len(result.factors) == 4
    assert {f.key for f in result.factors} == {"temperature", "climate_control", "driving_profile", "battery_health"}


# ---------------------------------------------------------------------------
# Battery health by age (4th factor)
# ---------------------------------------------------------------------------


def test_omitting_registration_date_is_a_documented_no_op():
    result = calculate_range(battery_capacity_kwh=40.0, current_battery_pct=100.0, efficiency_wh_km=150.0)
    health_factor = next(f for f in result.factors if f.key == "battery_health")
    assert health_factor.multiplier == 1.0
    assert "not on file" in health_factor.detail


def test_registration_date_reduces_range_by_documented_amount():
    import datetime as dt

    baseline = calculate_range(battery_capacity_kwh=40.0, current_battery_pct=100.0, efficiency_wh_km=150.0)
    old_vehicle = calculate_range(
        battery_capacity_kwh=40.0,
        current_battery_pct=100.0,
        efficiency_wh_km=150.0,
        registration_date=dt.date.today() - dt.timedelta(days=365 * 3),
    )
    health_factor = next(f for f in old_vehicle.factors if f.key == "battery_health")
    assert health_factor.multiplier < 1.0
    assert old_vehicle.buffered_range_km < baseline.buffered_range_km
