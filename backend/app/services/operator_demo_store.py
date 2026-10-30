"""In-memory Operator Demo Mode.

Isolated from production charger/booking rows. The mock token can only
read and write this catalog — it cannot patch another operator's stations.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from threading import Lock
from uuid import uuid4

from fastapi import HTTPException, status
from types import SimpleNamespace

from app.engines.occupancy import SOURCE_SIMULATOR, booking_state_from_rows, normalize_physical, occupancy_view
from app.models.user import ROLE_OPERATOR
from app.schemas.auth import AuthUser, ProfileRead
from app.schemas.fast_track import SimulatePhysicalStatusRequest
from app.schemas.operator import (
    OPERATOR_CHARGER_STATUSES,
    OperatorBookingRead,
    OperatorChargerCreate,
    OperatorChargerRead,
    OperatorChargerUpdate,
)
from app.services.pricing_service import calculate_slot_price

DEMO_OPERATOR_TOKEN = "mock-operator-token"
DEMO_OPERATOR_ID = "user-operator-demo"
DEMO_OPERATOR_EMAIL = "operator.demo@vidyutone.local"

_lock = Lock()
_state: dict | None = None


def is_demo_operator(user_id: str) -> bool:
    return user_id == DEMO_OPERATOR_ID


def demo_auth_user() -> AuthUser:
    return AuthUser(
        id=DEMO_OPERATOR_ID,
        email=DEMO_OPERATOR_EMAIL,
        full_name="Demo Operator",
        role=ROLE_OPERATOR,
        is_verified=True,
        is_active=True,
        verification_status="approved",
    )


def demo_profile() -> ProfileRead:
    return ProfileRead(
        id=DEMO_OPERATOR_ID,
        full_name="Demo Operator",
        email=DEMO_OPERATOR_EMAIL,
        role=ROLE_OPERATOR,
        organization="Operator Demo Mode",
        designation="Local demo",
        is_verified=True,
        is_active=True,
        verification_status="approved",
        created_at=datetime.now(timezone.utc),
    )


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _seed() -> dict:
    now = _now()
    created = now - timedelta(days=12)
    chargers = [
        {
            "id": "demo-op-indiranagar-rapid",
            "name": "Indiranagar Rapid Hub",
            "latitude": 12.9784,
            "longitude": 77.6408,
            "power_kw": 150.0,
            "price_per_kwh": 22.0,
            "connector_type": "CCS2",
            "status": "AVAILABLE",
            "availability": True,
            "site_id": None,
            "created_at": created,
            "physical_status": "CHARGING",
            "physical_status_source": SOURCE_SIMULATOR,
        },
        {
            "id": "demo-op-koramangala-ccs",
            "name": "Koramangala CCS",
            "latitude": 12.9352,
            "longitude": 77.6245,
            "power_kw": 60.0,
            "price_per_kwh": 16.0,
            "connector_type": "CCS2",
            "status": "AVAILABLE",
            "availability": True,
            "site_id": None,
            "created_at": created,
            "physical_status": "AVAILABLE",
            "physical_status_source": SOURCE_SIMULATOR,
        },
        {
            "id": "demo-op-whitefield-ac",
            "name": "Whitefield AC Hub",
            "latitude": 12.9698,
            "longitude": 77.7499,
            "power_kw": 22.0,
            "price_per_kwh": 11.0,
            "connector_type": "Type 2",
            "status": "AVAILABLE",
            "availability": True,
            "site_id": None,
            "created_at": created,
            "physical_status": "PREPARING",
            "physical_status_source": SOURCE_SIMULATOR,
        },
        {
            "id": "demo-op-mg-road",
            "name": "MG Road Mixed Hub",
            "latitude": 12.9750,
            "longitude": 77.6060,
            "power_kw": 120.0,
            "price_per_kwh": 18.0,
            "connector_type": "CCS2",
            "status": "AVAILABLE",
            "availability": True,
            "site_id": None,
            "created_at": created,
            "physical_status": "FINISHING",
            "physical_status_source": SOURCE_SIMULATOR,
        },
    ]
    bookings = []
    evening = now.replace(hour=18, minute=0, second=0, microsecond=0)
    if evening > now:
        evening = evening - timedelta(days=1)
    catalog = [
        ("demo-op-indiranagar-rapid", 240.0, "COMPLETED", evening - timedelta(days=2)),
        ("demo-op-indiranagar-rapid", 220.0, "COMPLETED", evening - timedelta(days=1)),
        ("demo-op-indiranagar-rapid", 260.0, "BOOKED", evening + timedelta(hours=1)),
        ("demo-op-koramangala-ccs", 96.0, "COMPLETED", evening - timedelta(hours=1)),
        ("demo-op-koramangala-ccs", 110.0, "ACTIVE", evening),
        ("demo-op-whitefield-ac", 48.0, "COMPLETED", evening.replace(hour=11) - timedelta(days=1)),
        ("demo-op-mg-road", 180.0, "COMPLETED", evening - timedelta(days=3)),
        ("demo-op-mg-road", 190.0, "BOOKED", evening + timedelta(days=1)),
    ]
    for charger_id, price, booking_status, slot in catalog:
        bookings.append(
            {
                "id": f"demo-bk-{uuid4().hex[:10]}",
                "charger_id": charger_id,
                "slot_time": slot,
                "duration_minutes": 30,
                "price": price,
                "status": booking_status,
            }
        )
    return {"chargers": chargers, "bookings": bookings}


def _state_unlocked() -> dict:
    global _state
    if _state is None:
        _state = _seed()
    return _state


def reset_demo_state() -> None:
    global _state
    with _lock:
        _state = _seed()


def _to_read(row: dict, bookings: list[dict], now: datetime) -> OperatorChargerRead:
    snaps = [
        SimpleNamespace(
            charger_id=item["charger_id"],
            status=item["status"],
            slot_time=item["slot_time"],
            duration_minutes=item["duration_minutes"],
        )
        for item in bookings
    ]
    booking_state = booking_state_from_rows(snaps, row["id"], now)
    view = occupancy_view(
        physical_status=row.get("physical_status"),
        booking_state=booking_state,
        status_source=row.get("physical_status_source"),
        operator_status=row.get("status"),
    )
    occupancy = view.occupancy
    if row["status"] == "MAINTENANCE":
        occupancy = "MAINTENANCE"
    elif row["status"] == "OFFLINE" and occupancy != "OCCUPIED":
        occupancy = "OFFLINE"
    return OperatorChargerRead(
        id=row["id"],
        name=row["name"],
        latitude=row["latitude"],
        longitude=row["longitude"],
        power_kw=row["power_kw"],
        price_per_kwh=row["price_per_kwh"],
        connector_type=row["connector_type"],
        status=row["status"],
        availability=bool(row["availability"]),
        occupancy=occupancy,
        site_id=row.get("site_id"),
        created_at=row["created_at"],
        physical_status=view.physical_status,
        physical_status_source=row.get("physical_status_source") or "SIMULATOR",
        unexpected_occupancy=view.unexpected_occupancy,
        occupancy_detail=view.operator_message or view.driver_message,
        qr_path=f"/charger/{row['id']}",
    )


def _booking_reads(state: dict) -> list[OperatorBookingRead]:
    by_id = {c["id"]: c for c in state["chargers"] if c.get("id")}
    out: list[OperatorBookingRead] = []
    for row in sorted(state["bookings"], key=lambda item: item["slot_time"], reverse=True):
        charger = by_id.get(row["charger_id"])
        if charger is None:
            continue
        slot = row["slot_time"]
        if slot.tzinfo is None:
            slot = slot.replace(tzinfo=timezone.utc)
        tier = calculate_slot_price(slot, float(charger["price_per_kwh"]))
        if tier["is_peak"]:
            window = "Peak"
        elif tier["is_off_peak"]:
            window = "Off-Peak"
        else:
            window = "Standard"
        out.append(
            OperatorBookingRead(
                id=row["id"],
                charger_id=row["charger_id"],
                charger_name=charger["name"],
                slot_time=slot,
                duration_minutes=row["duration_minutes"],
                price=float(row["price"]),
                status=row["status"],
                window_label=window,
            )
        )
    return out


def list_chargers() -> list[OperatorChargerRead]:
    now = _now()
    with _lock:
        state = _state_unlocked()
        return [_to_read(c, state["bookings"], now) for c in state["chargers"] if c.get("id")]


def create_charger(payload: OperatorChargerCreate) -> OperatorChargerRead:
    status_value = (payload.status or "AVAILABLE").upper()
    if status_value not in OPERATOR_CHARGER_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid charger status.")
    now = _now()
    row = {
        "id": f"demo-op-{uuid4().hex[:12]}",
        "name": payload.name.strip(),
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "power_kw": float(payload.power_kw),
        "price_per_kwh": float(payload.price_per_kwh),
        "connector_type": payload.connector_type.strip() or "CCS2",
        "status": status_value,
        "availability": status_value == "AVAILABLE",
        "site_id": None,
        "created_at": now,
        "physical_status": "AVAILABLE",
        "physical_status_source": SOURCE_SIMULATOR,
    }
    with _lock:
        state = _state_unlocked()
        state["chargers"].insert(0, row)
        return _to_read(row, state["bookings"], now)


def update_charger(charger_id: str, payload: OperatorChargerUpdate) -> OperatorChargerRead:
    now = _now()
    with _lock:
        state = _state_unlocked()
        row = next((item for item in state["chargers"] if item.get("id") == charger_id), None)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Charger not found")
        if payload.name is not None:
            row["name"] = payload.name.strip()
        if payload.power_kw is not None:
            row["power_kw"] = float(payload.power_kw)
        if payload.price_per_kwh is not None:
            row["price_per_kwh"] = float(payload.price_per_kwh)
        if payload.connector_type is not None:
            row["connector_type"] = payload.connector_type.strip()
        if payload.status is not None:
            status_value = payload.status.upper()
            if status_value not in OPERATOR_CHARGER_STATUSES:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid charger status.")
            row["status"] = status_value
            row["availability"] = status_value == "AVAILABLE"
        if payload.availability is not None and payload.status is None:
            row["availability"] = payload.availability
            row["status"] = "AVAILABLE" if payload.availability else "OFFLINE"
        return _to_read(row, state["bookings"], now)


def simulate_physical_status(charger_id: str, payload: SimulatePhysicalStatusRequest) -> OperatorChargerRead:
    source = (payload.source or SOURCE_SIMULATOR).upper()
    if source == "OCPP":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Simulator cannot write status_source=OCPP. Use the OCPP WebSocket endpoint for hardware telemetry.",
        )
    now = _now()
    with _lock:
        state = _state_unlocked()
        row = next((item for item in state["chargers"] if item.get("id") == charger_id), None)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Charger not found")
        row["physical_status"] = normalize_physical(payload.physical_status)
        row["physical_status_source"] = SOURCE_SIMULATOR
        return _to_read(row, state["bookings"], now)


def list_bookings() -> list[OperatorBookingRead]:
    with _lock:
        return _booking_reads(_state_unlocked())


def analytics():
    from app.services.operator_service import analytics_from_reads

    now = _now()
    with _lock:
        state = deepcopy(_state_unlocked())
    reads = [_to_read(c, state["bookings"], now) for c in state["chargers"] if c.get("id")]
    return analytics_from_reads(reads, state["bookings"], now, provenance="DEMO")
