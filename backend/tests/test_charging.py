from datetime import datetime, timezone

from app.services.charging_service import authoritative_session_price, estimated_energy_kwh
from app.services.pricing_service import calculate_slot_price


def test_peak_tariff_exceeds_offpeak() -> None:
    base = 20.0
    peak = calculate_slot_price(datetime(2026, 8, 20, 19, 0, tzinfo=timezone.utc), base)
    offpeak = calculate_slot_price(datetime(2026, 8, 20, 23, 0, tzinfo=timezone.utc), base)
    assert peak["is_peak"] is True
    assert offpeak["is_off_peak"] is True
    assert peak["price"] > offpeak["price"]
    assert peak["price"] == 25.0
    assert offpeak["price"] == 16.0


def test_energy_uses_vehicle_soc_gap() -> None:
    energy = estimated_energy_kwh(
        battery_capacity_kwh=40.0,
        current_battery_pct=50.0,
        charger_power_kw=22.0,
    )
    assert energy == 12.0


def test_python_energy_rounding_matches_booking_price() -> None:
    """40.5 kWh at 45% SOC is the reported 14.17 kWh / ₹209.72 Off-Peak case."""
    energy = estimated_energy_kwh(
        battery_capacity_kwh=40.5,
        current_battery_pct=45.0,
        charger_power_kw=22.0,
    )
    assert energy == 14.17
    slot = datetime(2026, 8, 20, 23, 0, tzinfo=timezone.utc)
    price = authoritative_session_price(slot, 18.5, energy)
    assert price == 209.72
    assert price == round(14.17 * 14.8, 2)


def test_authoritative_price_ignores_hardcoded_totals() -> None:
    slot = datetime(2026, 8, 20, 23, 0, tzinfo=timezone.utc)
    price = authoritative_session_price(slot, 18.5, 7.7)
    assert price != 86
    assert price != 98
    assert price != 142
    assert price == round(7.7 * 14.8, 2)
