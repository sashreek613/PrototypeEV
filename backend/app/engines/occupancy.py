"""Booking status vs physical (OCPP) status.

Pure functions. Booking rows never include driver identity here.
Physical CHARGING with no booking is occupied, not available.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

PHYSICAL_AVAILABLE = "AVAILABLE"
PHYSICAL_PREPARING = "PREPARING"
PHYSICAL_CHARGING = "CHARGING"
PHYSICAL_SUSPENDED = "SUSPENDED"
PHYSICAL_FINISHING = "FINISHING"
PHYSICAL_UNAVAILABLE = "UNAVAILABLE"
PHYSICAL_FAULTED = "FAULTED"

VALID_PHYSICAL_STATUSES = frozenset(
    {
        PHYSICAL_AVAILABLE,
        PHYSICAL_PREPARING,
        PHYSICAL_CHARGING,
        PHYSICAL_SUSPENDED,
        PHYSICAL_FINISHING,
        PHYSICAL_UNAVAILABLE,
        PHYSICAL_FAULTED,
    }
)

PHYSICAL_BUSY = frozenset(
    {PHYSICAL_PREPARING, PHYSICAL_CHARGING, PHYSICAL_SUSPENDED, PHYSICAL_FINISHING}
)
PHYSICAL_DOWN = frozenset({PHYSICAL_UNAVAILABLE, PHYSICAL_FAULTED})

SOURCE_OCPP = "OCPP"
SOURCE_SIMULATOR = "SIMULATOR"
SOURCE_MANUAL = "MANUAL"
VALID_STATUS_SOURCES = frozenset({SOURCE_OCPP, SOURCE_SIMULATOR, SOURCE_MANUAL})

OCCUPANCY_AVAILABLE = "AVAILABLE"
OCCUPANCY_OCCUPIED = "OCCUPIED"
OCCUPANCY_RESERVED = "RESERVED"
OCCUPANCY_UNAVAILABLE = "UNAVAILABLE"

OCPP_CONNECTOR_MAP = {
    "available": PHYSICAL_AVAILABLE,
    "occupied": PHYSICAL_CHARGING,
    "reserved": PHYSICAL_AVAILABLE,
    "unavailable": PHYSICAL_UNAVAILABLE,
    "faulted": PHYSICAL_FAULTED,
}


@dataclass(frozen=True)
class OccupancyView:
    occupancy: str
    physical_status: str
    booking_state: str
    unexpected_occupancy: bool
    conflict: bool
    driver_message: str
    operator_message: str | None
    provenance: str


def normalize_physical(value: str | None) -> str:
    raw = (value or PHYSICAL_AVAILABLE).strip().upper()
    if raw == "SUSPENDEDEVSE":
        return PHYSICAL_SUSPENDED
    if raw in VALID_PHYSICAL_STATUSES:
        return raw
    return PHYSICAL_AVAILABLE


def map_ocpp_connector_status(value: object | None) -> str:
    raw = getattr(value, "value", value)
    key = str(raw or "").strip().lower()
    return OCPP_CONNECTOR_MAP.get(key, PHYSICAL_AVAILABLE)


def physically_busy(physical: str | None) -> bool:
    return normalize_physical(physical) in PHYSICAL_BUSY


def physically_down(physical: str | None) -> bool:
    return normalize_physical(physical) in PHYSICAL_DOWN


def physically_usable(physical: str | None) -> bool:
    return not physically_down(physical) and not physically_busy(physical)


def occupancy_view(
    *,
    physical_status: str | None,
    booking_state: str,
    status_source: str | None = None,
    operator_status: str | None = None,
) -> OccupancyView:
    """booking_state: NONE | RESERVED | ACTIVE.

    CASE 1 NONE + AVAILABLE → Available
    CASE 2 NONE + CHARGING → Occupied
    CASE 3 RESERVED + AVAILABLE → Reserved
    CASE 4 NONE + FAULTED → Unavailable
    CASE 5 RESERVED + CHARGING → Physical occupancy conflict
    """
    physical = normalize_physical(physical_status)
    booking = (booking_state or "NONE").upper()
    source = (status_source or SOURCE_MANUAL).upper()
    if operator_status == "MAINTENANCE":
        return OccupancyView(
            occupancy=OCCUPANCY_UNAVAILABLE,
            physical_status=physical,
            booking_state=booking,
            unexpected_occupancy=False,
            conflict=False,
            driver_message="This charger is in maintenance.",
            operator_message=None,
            provenance="REAL" if source == SOURCE_OCPP else "DERIVED",
        )
    if physically_down(physical):
        return OccupancyView(
            occupancy=OCCUPANCY_UNAVAILABLE,
            physical_status=physical,
            booking_state=booking,
            unexpected_occupancy=False,
            conflict=False,
            driver_message="This charger is currently unavailable.",
            operator_message=None,
            provenance="REAL" if source == SOURCE_OCPP else "DERIVED",
        )
    busy = physically_busy(physical)
    if busy and booking == "NONE":
        return OccupancyView(
            occupancy=OCCUPANCY_OCCUPIED,
            physical_status=physical,
            booking_state=booking,
            unexpected_occupancy=True,
            conflict=False,
            driver_message="Someone is currently charging.",
            operator_message="Unexpected occupancy detected. Physical status is charging with no VidyutOne booking.",
            provenance="REAL" if source == SOURCE_OCPP else "DERIVED",
        )
    if busy and booking in {"RESERVED", "ACTIVE"}:
        return OccupancyView(
            occupancy=OCCUPANCY_OCCUPIED,
            physical_status=physical,
            booking_state=booking,
            unexpected_occupancy=False,
            conflict=True,
            driver_message="Someone is currently charging.",
            operator_message="Physical occupancy conflict: a reservation exists and the plug is also physically busy.",
            provenance="REAL" if source == SOURCE_OCPP else "DERIVED",
        )
    if booking in {"RESERVED", "ACTIVE"}:
        return OccupancyView(
            occupancy=OCCUPANCY_RESERVED if booking == "RESERVED" else OCCUPANCY_OCCUPIED,
            physical_status=physical,
            booking_state=booking,
            unexpected_occupancy=False,
            conflict=False,
            driver_message="This charger is reserved." if booking == "RESERVED" else "This charger is occupied.",
            operator_message=None,
            provenance="DERIVED",
        )
    return OccupancyView(
        occupancy=OCCUPANCY_AVAILABLE,
        physical_status=physical,
        booking_state="NONE",
        unexpected_occupancy=False,
        conflict=False,
        driver_message="Available for Fast Track.",
        operator_message=None,
        provenance="DERIVED",
    )


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def booking_state_from_rows(rows: list, charger_id: str, now: datetime) -> str:
    """rows: objects with charger_id, status, slot_time, duration_minutes. No PII used."""
    now = _aware(now)
    reserved = False
    for row in rows:
        if getattr(row, "charger_id", None) != charger_id:
            continue
        status = getattr(row, "status", "")
        if status not in {"BOOKED", "ACTIVE", "PAYMENT_PENDING"}:
            continue
        start = _aware(row.slot_time)
        minutes = getattr(row, "duration_minutes", 30) or 30
        end = start + timedelta(minutes=minutes)
        if start <= now < end:
            return "ACTIVE" if status == "ACTIVE" else "RESERVED"
        if now < start <= now + timedelta(hours=24) and status in {"BOOKED", "PAYMENT_PENDING"}:
            reserved = True
    return "RESERVED" if reserved else "NONE"
