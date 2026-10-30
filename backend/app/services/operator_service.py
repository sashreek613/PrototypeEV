"""Private operator station, booking, and analytics -- own chargers only.

Revenue is the sum of counted booking.price rows (REAL when paid/booked).
Utilization and occupancy are DERIVED from overlapping bookings.
No other operator's rows are returned. No driver PII is exposed.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.engines.occupancy import (
    SOURCE_SIMULATOR,
    booking_state_from_rows,
    occupancy_view,
)
from app.models.booking import Booking
from app.models.charger import (
    CHARGER_STATUS_AVAILABLE,
    CHARGER_STATUS_MAINTENANCE,
    CHARGER_STATUS_OFFLINE,
    Charger,
)
from app.schemas.booking import BookingStatus
from app.schemas.operator import (
    OPERATOR_CHARGER_STATUSES,
    OperatorAnalyticsRead,
    OperatorBookingRead,
    OperatorChargerCreate,
    OperatorChargerRead,
    OperatorChargerUpdate,
    OperatorInsightRead,
)
from app.schemas.fast_track import SimulatePhysicalStatusRequest
from app.services.physical_status_service import apply_status
from app.services.pricing_service import calculate_slot_price

COUNTED = frozenset(
    {
        BookingStatus.BOOKED.value,
        BookingStatus.ACTIVE.value,
        BookingStatus.COMPLETED.value,
    }
)

# Rule-based operator intelligence thresholds (not ML).
HIGH_UTILIZATION_PCT = 70.0
LOW_UTILIZATION_PCT = 20.0
PEAK_CONCENTRATION = 0.35
EVENING_HOURS = frozenset({18, 19, 20})


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _occupancy_view(charger: Charger, bookings: list[Booking], now: datetime):
    booking_state = booking_state_from_rows(bookings, charger.id, now)
    return occupancy_view(
        physical_status=getattr(charger, "physical_status", None),
        booking_state=booking_state,
        status_source=getattr(charger, "physical_status_source", None),
        operator_status=charger.status,
    )


def _to_read(charger: Charger, bookings: list[Booking], now: datetime) -> OperatorChargerRead:
    view = _occupancy_view(charger, bookings, now)
    occupancy = view.occupancy
    if charger.status == CHARGER_STATUS_MAINTENANCE:
        occupancy = "MAINTENANCE"
    elif charger.status == CHARGER_STATUS_OFFLINE and view.occupancy != "OCCUPIED":
        occupancy = "OFFLINE"
    return OperatorChargerRead(
        id=charger.id,
        name=charger.name,
        latitude=charger.latitude,
        longitude=charger.longitude,
        power_kw=float(charger.power_kw),
        price_per_kwh=float(charger.price_per_kwh),
        connector_type=charger.connector_type,
        status=charger.status,
        availability=charger.availability,
        occupancy=occupancy,
        site_id=charger.site_id,
        created_at=charger.created_at,
        physical_status=view.physical_status,
        physical_status_source=getattr(charger, "physical_status_source", None) or "MANUAL",
        unexpected_occupancy=view.unexpected_occupancy,
        occupancy_detail=view.operator_message or view.driver_message,
        qr_path=f"/charger/{charger.id}",
    )


def list_operator_chargers(db: Session, operator_id: str) -> list[OperatorChargerRead]:
    now = datetime.now(timezone.utc)
    chargers = db.query(Charger).filter(Charger.operator_id == operator_id).order_by(Charger.created_at.desc()).all()
    ids = [c.id for c in chargers]
    bookings = db.query(Booking).filter(Booking.charger_id.in_(ids)).all() if ids else []
    return [_to_read(c, bookings, now) for c in chargers]


def create_operator_charger(db: Session, operator_id: str, payload: OperatorChargerCreate) -> OperatorChargerRead:
    status_value = (payload.status or CHARGER_STATUS_AVAILABLE).upper()
    if status_value not in OPERATOR_CHARGER_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid charger status.")
    charger_id = f"op-{uuid4().hex[:16]}"
    charger = Charger(
        id=charger_id,
        name=payload.name.strip(),
        latitude=payload.latitude,
        longitude=payload.longitude,
        power_kw=int(round(payload.power_kw)),
        price_per_kwh=payload.price_per_kwh,
        availability=status_value == CHARGER_STATUS_AVAILABLE,
        connector_type=payload.connector_type.strip() or "CCS2",
        status=status_value,
        site_id=None,
        operator_id=operator_id,
        ocpp_identity=charger_id,
        physical_status="AVAILABLE",
        physical_status_source="MANUAL",
    )
    db.add(charger)
    db.commit()
    db.refresh(charger)
    return _to_read(charger, [], datetime.now(timezone.utc))


def update_operator_charger(
    db: Session,
    operator_id: str,
    charger_id: str,
    payload: OperatorChargerUpdate,
) -> OperatorChargerRead:
    charger = db.get(Charger, charger_id)
    if charger is None or charger.operator_id != operator_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Charger not found")
    if payload.name is not None:
        charger.name = payload.name.strip()
    if payload.power_kw is not None:
        charger.power_kw = int(round(payload.power_kw))
    if payload.price_per_kwh is not None:
        charger.price_per_kwh = payload.price_per_kwh
    if payload.connector_type is not None:
        charger.connector_type = payload.connector_type.strip()
    if payload.status is not None:
        status_value = payload.status.upper()
        if status_value not in OPERATOR_CHARGER_STATUSES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid charger status.")
        charger.status = status_value
        if status_value == CHARGER_STATUS_AVAILABLE:
            charger.availability = True
        else:
            charger.availability = False
    if payload.availability is not None and payload.status is None:
        charger.availability = payload.availability
        if payload.availability:
            charger.status = CHARGER_STATUS_AVAILABLE
        elif charger.status == CHARGER_STATUS_AVAILABLE:
            charger.status = CHARGER_STATUS_OFFLINE
    db.add(charger)
    db.commit()
    db.refresh(charger)
    bookings = db.query(Booking).filter(Booking.charger_id == charger.id).all()
    return _to_read(charger, bookings, datetime.now(timezone.utc))


def simulate_physical_status(
    db: Session,
    operator_id: str,
    charger_id: str,
    payload: SimulatePhysicalStatusRequest,
) -> OperatorChargerRead:
    charger = db.get(Charger, charger_id)
    if charger is None or charger.operator_id != operator_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Charger not found")
    source = (payload.source or SOURCE_SIMULATOR).upper()
    if source == "OCPP":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Simulator cannot write status_source=OCPP. Use the OCPP WebSocket endpoint for hardware telemetry.",
        )
    if source not in {SOURCE_SIMULATOR, "MANUAL"}:
        source = SOURCE_SIMULATOR
    apply_status(db, charger=charger, physical_status=payload.physical_status, source=source)
    bookings = db.query(Booking).filter(Booking.charger_id == charger.id).all()
    return _to_read(charger, bookings, datetime.now(timezone.utc))


def list_operator_bookings(db: Session, operator_id: str) -> list[OperatorBookingRead]:
    chargers = db.query(Charger).filter(Charger.operator_id == operator_id).all()
    by_id = {c.id: c for c in chargers}
    if not by_id:
        return []
    rows = (
        db.query(Booking)
        .filter(Booking.charger_id.in_(list(by_id)))
        .order_by(Booking.slot_time.desc())
        .all()
    )
    out: list[OperatorBookingRead] = []
    for row in rows:
        charger = by_id.get(row.charger_id)
        if charger is None:
            continue
        slot = _aware(row.slot_time)
        tier = calculate_slot_price(slot, float(charger.price_per_kwh))
        if tier["is_peak"]:
            window = "Peak"
        elif tier["is_off_peak"]:
            window = "Off-Peak"
        else:
            window = "Standard"
        out.append(
            OperatorBookingRead(
                id=row.id,
                charger_id=row.charger_id,
                charger_name=charger.name,
                slot_time=row.slot_time,
                duration_minutes=getattr(row, "duration_minutes", 30) or 30,
                price=float(row.price),
                status=row.status,
                window_label=window,
            )
        )
    return out


def _row_get(row, key, default=None):
    if isinstance(row, dict):
        return row.get(key, default)
    return getattr(row, key, default)


def compose_operator_intelligence(
    *,
    reads: list[OperatorChargerRead],
    counted: list,
    utilization: float,
    peak_period: str | None,
    peak_hour: int | None,
    hours: Counter,
    provenance: str,
) -> tuple[list[OperatorInsightRead], list[OperatorInsightRead]]:
    """Build network + per-station insights from counted bookings and live occupancy."""
    insights: list[OperatorInsightRead] = []
    station_insights: list[OperatorInsightRead] = []
    total = len(reads)
    available = sum(1 for r in reads if r.occupancy == "AVAILABLE")
    occupied = sum(1 for r in reads if r.occupancy in {"OCCUPIED", "RESERVED"})
    counted_n = len(counted)
    hour_total = sum(hours.values()) if hours else 0
    evening_n = sum(hours.get(hour, 0) for hour in EVENING_HOURS)

    unexpected = [r for r in reads if r.unexpected_occupancy]
    if unexpected:
        insights.append(
            OperatorInsightRead(
                kind="unexpected_occupancy",
                title="Unexpected occupancy detected",
                body=(
                    f"{len(unexpected)} charger(s) report physical charging with no VidyutOne booking. "
                    "The person at the plug is not identified."
                ),
                provenance=provenance,
            )
        )

    if total > 0:
        insights.append(
            OperatorInsightRead(
                kind="visibility",
                title="Your stations are visible to nearby EV drivers",
                body=(
                    f"{total} charger(s) can appear in driver discovery and recommendations. "
                    f"{counted_n} counted booking(s) were generated through VidyutOne on your stations."
                ),
                provenance=provenance,
            )
        )

    if peak_period and hour_total and (peak_hour in EVENING_HOURS or evening_n / max(hour_total, 1) >= PEAK_CONCENTRATION):
        insights.append(
            OperatorInsightRead(
                kind="demand_alert",
                title="Demand alert",
                body=(
                    f"High charging demand is concentrated around {peak_period}. "
                    "This is DERIVED from counted booking hours, not an ML forecast."
                ),
                provenance=provenance,
            )
        )
        insights.append(
            OperatorInsightRead(
                kind="pricing_insight",
                title="Pricing insight",
                body=(
                    "Peak demand is concentrated in evening hours. Off-peak periods have lower booking density. "
                    "Consider off-peak incentives — tariffs are not changed automatically."
                ),
                provenance=provenance,
            )
        )

    if utilization >= HIGH_UTILIZATION_PCT:
        insights.append(
            OperatorInsightRead(
                kind="high_utilization",
                title="High utilization detected — consider adding capacity",
                body=(
                    f"Utilization is {utilization:.0f}% now ({occupied} occupied / reserved of {total}). "
                    f"Threshold: occupancy ≥ {HIGH_UTILIZATION_PCT:.0f}%. Peak booking hour: {peak_period or 'not enough bookings yet'}."
                ),
                provenance=provenance,
            )
        )
        insights.append(
            OperatorInsightRead(
                kind="capacity",
                title="Capacity recommendation",
                body="Station utilization is consistently high during the current window. Consider adding another charger.",
                provenance=provenance,
            )
        )
    elif total == 0:
        insights.append(
            OperatorInsightRead(
                kind="empty",
                title="No stations yet",
                body="Add a charger to start appearing in driver discovery and collecting booking analytics.",
                provenance=provenance,
            )
        )
    elif utilization < LOW_UTILIZATION_PCT:
        insights.append(
            OperatorInsightRead(
                kind="low_utilization",
                title="Low utilization detected",
                body=(
                    f"Utilization is {utilization:.0f}% (threshold < {LOW_UTILIZATION_PCT:.0f}%). "
                    "Consider improving visibility in driver search or adjusting off-peak pricing. "
                    "Tariffs are not changed automatically."
                ),
                provenance=provenance,
            )
        )
    elif not unexpected:
        insights.append(
            OperatorInsightRead(
                kind="steady",
                title="Network load is manageable",
                body=f"{available} of {total} chargers currently available. Revenue is the sum of counted booking prices, not a projection.",
                provenance=provenance,
            )
        )

    by_charger = Counter(_row_get(b, "charger_id") for b in counted)
    avg_bookings = (sum(by_charger.values()) / max(len(reads), 1)) if reads else 0
    for row in reads:
        if row.occupancy in {"OCCUPIED", "RESERVED"}:
            station_insights.append(
                OperatorInsightRead(
                    kind="availability",
                    title=f"{row.name} is currently occupied",
                    body="Live occupancy is DERIVED from physical status and overlapping bookings. Drivers will not see this plug as freely available.",
                    provenance=provenance,
                    charger_id=row.id,
                    charger_name=row.name,
                )
            )
        count = by_charger.get(row.id, 0)
        if reads and count >= max(avg_bookings * 1.5, 2) and peak_hour in EVENING_HOURS:
            station_insights.append(
                OperatorInsightRead(
                    kind="peak_congestion",
                    title=f"Peak congestion on {row.name}",
                    body="High congestion during 18:00–21:00 — consider adding a charger or encouraging off-peak charging. Rule: this station has ≥ 1.5× average counted bookings.",
                    provenance=provenance,
                    charger_id=row.id,
                    charger_name=row.name,
                )
            )
        if row.occupancy == "AVAILABLE" and utilization < LOW_UTILIZATION_PCT and total >= 2:
            station_insights.append(
                OperatorInsightRead(
                    kind="idle_capacity",
                    title=f"{row.name} is underused outside peak hours",
                    body="Several chargers remain underutilized. Improving driver visibility or off-peak pricing may help. Not an ML prediction.",
                    provenance=provenance,
                    charger_id=row.id,
                    charger_name=row.name,
                )
            )

    return insights, station_insights


def analytics_from_reads(
    reads: list[OperatorChargerRead],
    bookings: list,
    now: datetime,
    provenance: str = "DERIVED",
) -> OperatorAnalyticsRead:
    available = sum(1 for r in reads if r.occupancy == "AVAILABLE")
    occupied = sum(1 for r in reads if r.occupancy in {"OCCUPIED", "RESERVED"})
    maintenance = sum(
        1
        for r in reads
        if r.occupancy in {"MAINTENANCE", "OFFLINE", "UNAVAILABLE"} or r.status == CHARGER_STATUS_MAINTENANCE
    )
    counted = [b for b in bookings if _row_get(b, "status") in COUNTED]
    upcoming = 0
    for b in bookings:
        if _row_get(b, "status") in {BookingStatus.BOOKED.value, BookingStatus.PAYMENT_PENDING.value, BookingStatus.ACTIVE.value}:
            start = _aware(_row_get(b, "slot_time"))
            if start >= now:
                upcoming += 1
    revenue = round(sum(float(_row_get(b, "price") or 0) for b in counted), 2)
    average_booking_value = round(revenue / len(counted), 2) if counted else None
    utilization = round((occupied / max(len(reads), 1)) * 100.0, 1) if reads else 0.0
    hours: Counter = Counter()
    for b in counted:
        hours[_aware(_row_get(b, "slot_time")).hour] += 1
    peak_period = None
    peak_hour = None
    if hours:
        peak_hour = max(hours, key=hours.get)
        peak_period = f"{peak_hour:02d}:00–{(peak_hour + 1) % 24:02d}:00 UTC"
    repeat_users = None
    user_counts = Counter(_row_get(b, "user_id") for b in counted if _row_get(b, "user_id"))
    if user_counts:
        repeat_users = sum(1 for _, n in user_counts.items() if n >= 2)

    insights, station_insights = compose_operator_intelligence(
        reads=reads,
        counted=counted,
        utilization=utilization,
        peak_period=peak_period,
        peak_hour=peak_hour,
        hours=hours,
        provenance=provenance,
    )
    note = (
        "Revenue is the sum of BOOKED/ACTIVE/COMPLETED booking prices on your chargers. "
        "Utilization is occupied plugs ÷ your charger count. Repeat users is a count of "
        "anonymized user ids with 2+ counted bookings -- no names or emails."
    )
    if provenance == "DEMO":
        note = "DEMO data. " + note + " Isolated from production charger records."

    return OperatorAnalyticsRead(
        total_stations=len(reads),
        total_chargers=len(reads),
        available_chargers=available,
        occupied_chargers=occupied,
        maintenance_chargers=maintenance,
        upcoming_bookings=upcoming,
        total_bookings=len(counted),
        utilization_pct=utilization,
        revenue=revenue,
        average_booking_value=average_booking_value,
        peak_usage_period=peak_period,
        repeat_users=repeat_users,
        insights=insights,
        station_insights=station_insights,
        provenance_note=note,
    )


def operator_analytics(db: Session, operator_id: str) -> OperatorAnalyticsRead:
    now = datetime.now(timezone.utc)
    chargers = db.query(Charger).filter(Charger.operator_id == operator_id).all()
    ids = [c.id for c in chargers]
    bookings = db.query(Booking).filter(Booking.charger_id.in_(ids)).all() if ids else []
    reads = [_to_read(c, bookings, now) for c in chargers]
    return analytics_from_reads(reads, bookings, now, provenance="DERIVED")
