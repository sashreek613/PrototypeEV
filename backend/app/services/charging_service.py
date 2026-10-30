"""Driver charging cost and savings helpers.

Tariffs always come from pricing_service.calculate_slot_price.
Energy for a new booking is derived from the driver's vehicle (or charger
power when no vehicle is on file). Historical energy is booked_cost / engine
tariff so no extra database column is required.
"""

from __future__ import annotations

from calendar import month_abbr
from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.booking import Booking
from app.models.charger import Charger
from app.schemas.booking import BookingStatus
from app.schemas.charging import (
    ChargingInsight,
    ChargingQuoteRead,
    ChargingSessionRead,
    ChargingSlotQuote,
    ChargingSummaryRead,
    MonthlyChargingSummary,
    MonthlyTrendPoint,
)
from app.services import vehicle_service
from app.services.pricing_service import calculate_slot_price

TARGET_SOC_PCT = 80.0
MIN_TOPUP_FRACTION = 0.05
COUNTED_STATUSES = frozenset(
    {
        BookingStatus.BOOKED.value,
        BookingStatus.ACTIVE.value,
        BookingStatus.COMPLETED.value,
    }
)


def _aware(slot_time: datetime) -> datetime:
    if slot_time.tzinfo is None:
        return slot_time.replace(tzinfo=timezone.utc)
    return slot_time.astimezone(timezone.utc)


def peak_reference_time(slot_time: datetime) -> datetime:
    """19:00 UTC is inside the pricing engine's published peak window."""
    return _aware(slot_time).replace(hour=19, minute=0, second=0, microsecond=0)


def offpeak_reference_time(slot_time: datetime) -> datetime:
    """23:00 UTC is inside the pricing engine's published off-peak window."""
    return _aware(slot_time).replace(hour=23, minute=0, second=0, microsecond=0)


def estimated_energy_kwh(
    *,
    battery_capacity_kwh: float | None,
    current_battery_pct: float | None,
    charger_power_kw: float,
    duration_minutes: int | None = None,
) -> float:
    """kWh to add for a session. Quantity only — not a tariff formula."""
    if battery_capacity_kwh and battery_capacity_kwh > 0 and current_battery_pct is not None:
        delta = max(TARGET_SOC_PCT - current_battery_pct, 0.0)
        needed = battery_capacity_kwh * (delta / 100.0)
        if duration_minutes is not None and duration_minutes > 0:
            hours = duration_minutes / 60.0
            delivered = float(charger_power_kw) * hours
            energy = min(needed, delivered) if needed > 0 else delivered
        else:
            energy = needed
        if energy < 0.5:
            energy = max(battery_capacity_kwh * MIN_TOPUP_FRACTION, 0.1)
        return round(energy, 2)
    hours = (duration_minutes or 30) / 60.0
    return round(min(float(charger_power_kw) * hours, 40.0), 2)


def session_cost(energy_kwh: float, tariff_per_kwh: float) -> float:
    return round(energy_kwh * tariff_per_kwh, 2)


def authoritative_session_price(
    slot_time: datetime,
    charger_price_per_kwh: float,
    energy_kwh: float,
) -> float:
    tier = calculate_slot_price(slot_time, charger_price_per_kwh)
    return session_cost(energy_kwh, tier["price"])


def window_label(is_peak: bool, is_off_peak: bool) -> str:
    if is_peak:
        return "Peak"
    if is_off_peak:
        return "Off-Peak"
    return "Standard"


def _derived_energy(cost: float, tariff_per_kwh: float) -> float | None:
    if tariff_per_kwh <= 0 or cost <= 0:
        return None
    return round(cost / tariff_per_kwh, 2)


def _session_from_booking(booking: Booking, charger: Charger) -> ChargingSessionRead:
    slot = _aware(booking.slot_time)
    base = charger.price_per_kwh
    actual = calculate_slot_price(slot, base)
    peak = calculate_slot_price(peak_reference_time(slot), base)
    energy = _derived_energy(booking.price, actual["price"])
    savings: float | None = None
    if energy is not None and peak["price"] > actual["price"]:
        savings = round(energy * (peak["price"] - actual["price"]), 2)
    elif energy is not None:
        savings = 0.0

    return ChargingSessionRead(
        booking_id=booking.id,
        charger_id=booking.charger_id,
        station_name=charger.name.replace(" (demo)", ""),
        slot_time=slot,
        window_label=window_label(actual["is_peak"], actual["is_off_peak"]),
        is_peak=actual["is_peak"],
        is_off_peak=actual["is_off_peak"],
        energy_kwh=energy,
        cost=booking.price,
        savings=savings,
        status=BookingStatus(booking.status),
    )


def _month_key(slot: datetime) -> str:
    aware = _aware(slot)
    return f"{aware.year:04d}-{aware.month:02d}"


def _month_label(key: str) -> str:
    month = int(key.split("-")[1])
    return month_abbr[month]


def _month_insight(
    month_rows: list[ChargingSessionRead],
    peak_shift_savings: float,
) -> ChargingInsight | None:
    realized = round(sum(row.savings for row in month_rows if row.savings and row.savings > 0), 2)
    if realized > 0:
        return ChargingInsight(
            kind="saved",
            amount=realized,
            text=f"This month you saved ₹{realized:g} by charging during Off-Peak hours.",
        )

    could_save = round(peak_shift_savings, 2)
    if could_save > 0:
        return ChargingInsight(
            kind="could_save",
            amount=could_save,
            text=(
                f"You could save approximately ₹{could_save:g} by shifting eligible "
                "charging sessions to Off-Peak hours."
            ),
        )
    return None


def build_charging_summary(db: Session, user_id: str) -> ChargingSummaryRead:
    stmt = (
        select(Booking)
        .options(joinedload(Booking.charger))
        .where(Booking.user_id == user_id)
        .where(Booking.status.in_(COUNTED_STATUSES))
        .order_by(Booking.slot_time.desc())
    )
    bookings = list(db.scalars(stmt).unique().all())

    history: list[ChargingSessionRead] = []
    now = datetime.now(timezone.utc)
    current_key = f"{now.year:04d}-{now.month:02d}"
    peak_shift_savings = 0.0

    for booking in bookings:
        charger = booking.charger
        if charger is None:
            continue
        session = _session_from_booking(booking, charger)
        history.append(session)
        if _month_key(session.slot_time) != current_key or session.energy_kwh is None:
            continue
        if not session.is_peak:
            continue
        base = charger.price_per_kwh
        peak = calculate_slot_price(peak_reference_time(session.slot_time), base)
        offpeak = calculate_slot_price(offpeak_reference_time(session.slot_time), base)
        if peak["price"] > offpeak["price"]:
            peak_shift_savings += session.energy_kwh * (peak["price"] - offpeak["price"])

    last_session = history[0] if history else None
    month_rows = [row for row in history if _month_key(row.slot_time) == current_key]

    month_cost = round(sum(row.cost for row in month_rows), 2) if month_rows else None
    month_energy_values = [row.energy_kwh for row in month_rows if row.energy_kwh is not None]
    month_energy = round(sum(month_energy_values), 2) if month_energy_values else None
    month_savings_values = [row.savings for row in month_rows if row.savings and row.savings > 0]
    month_savings = round(sum(month_savings_values), 2) if month_savings_values else None
    avg_session = round(month_cost / len(month_rows), 2) if month_cost is not None and month_rows else None
    avg_kwh = (
        round(month_cost / month_energy, 2)
        if month_cost is not None and month_energy and month_energy > 0
        else None
    )

    trend_cost: dict[str, float] = defaultdict(float)
    trend_energy: dict[str, float] = defaultdict(float)
    trend_has_energy: dict[str, bool] = defaultdict(bool)
    for row in history:
        key = _month_key(row.slot_time)
        trend_cost[key] += row.cost
        if row.energy_kwh is not None:
            trend_energy[key] += row.energy_kwh
            trend_has_energy[key] = True

    trend = [
        MonthlyTrendPoint(
            month=key,
            label=_month_label(key),
            cost=round(trend_cost[key], 2),
            energy_kwh=round(trend_energy[key], 2) if trend_has_energy[key] else None,
        )
        for key in sorted(trend_cost)
    ]

    all_energy = [row.energy_kwh for row in history if row.energy_kwh is not None]
    total_energy = round(sum(all_energy), 2) if all_energy else None

    return ChargingSummaryRead(
        history=history,
        month=MonthlyChargingSummary(
            sessions=len(month_rows),
            cost=month_cost,
            savings=month_savings,
            energy_kwh=month_energy,
            avg_cost_per_session=avg_session,
            avg_cost_per_kwh=avg_kwh,
        ),
        trend=trend,
        last_session=last_session,
        insight=_month_insight(month_rows, peak_shift_savings),
        total_energy_kwh=total_energy,
    )


def list_charging_history(db: Session, user_id: str) -> list[ChargingSessionRead]:
    return build_charging_summary(db, user_id).history


def quote_charging_slots(
    db: Session,
    user_id: str,
    charger: Charger | ChargerRead,
    slots: list[datetime],
    duration_minutes: int = 30,
) -> ChargingQuoteRead:
    """Same energy + tariff + rupee rounding as create_booking."""
    from app.core.config import get_settings
    settings = get_settings()
    vehicle = vehicle_service.get_primary_vehicle(db, user_id)
    power_kw = float(charger.power_kw) if charger.power_kw is not None else 7.4
    price_per_kwh = float(charger.price_per_kwh) if (charger.price_per_kwh is not None and charger.price_per_kwh > 0) else settings.DEFAULT_FALLBACK_TARIFF

    energy = estimated_energy_kwh(
        battery_capacity_kwh=vehicle.battery_capacity_kwh if vehicle else None,
        current_battery_pct=vehicle.current_battery_pct if vehicle else None,
        charger_power_kw=power_kw,
        duration_minutes=duration_minutes,
    )
    quotes: list[ChargingSlotQuote] = []
    for slot in slots:
        aware = _aware(slot)
        total = authoritative_session_price(aware, price_per_kwh, energy)
        tier = calculate_slot_price(aware, price_per_kwh)
        quotes.append(
            ChargingSlotQuote(
                slot_time=aware,
                tariff_per_kwh=tier["price"],
                total=total,
                is_peak=tier["is_peak"],
                is_off_peak=tier["is_off_peak"],
                savings_amount=tier["savings_amount"],
                description=tier["description"],
                window_label=window_label(tier["is_peak"], tier["is_off_peak"]),
            )
        )
    return ChargingQuoteRead(energy_kwh=energy, quotes=quotes)
