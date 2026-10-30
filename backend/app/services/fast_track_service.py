"""Fast Track: identify charger, check live occupancy, atomically reserve.

Frontend never decides availability. Physical status + overlapping bookings
are checked again inside a transaction at confirm time.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import engine, utcnow
from app.engines.occupancy import (
    OCCUPANCY_AVAILABLE,
    booking_state_from_rows,
    occupancy_view,
    physically_busy,
    physically_down,
)
from app.models.booking import Booking
from app.models.charger import Charger
from app.models.user import User
from app.schemas.booking import BookingRead, BookingStatus
from app.schemas.fast_track import FastTrackCheckRead
from app.services import charging_service, charger_service, vehicle_service


OCCUPIED_MESSAGE = "Charger became occupied. Please choose another charger."


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _lock_charger(db: Session, charger_id: str) -> Charger | None:
    query = db.query(Charger).filter(Charger.id == charger_id)
    if engine.dialect.name not in {"sqlite"}:
        query = query.with_for_update()
    return query.one_or_none()


def live_view(db: Session, charger_id: str) -> FastTrackCheckRead:
    charger_read = charger_service.get_charger(db, charger_id)
    db_charger = db.get(Charger, charger_id)
    now = _now()
    bookings = db.query(Booking).filter(Booking.charger_id == charger_id).all()
    booking_state = booking_state_from_rows(bookings, charger_id, now)
    physical = getattr(db_charger, "physical_status", None) if db_charger is not None else "AVAILABLE"
    source = getattr(db_charger, "physical_status_source", None) if db_charger is not None else "MANUAL"
    operator_status = getattr(db_charger, "status", None) if db_charger is not None else None
    view = occupancy_view(
        physical_status=physical,
        booking_state=booking_state,
        status_source=source,
        operator_status=operator_status,
    )
    return FastTrackCheckRead(
        charger_id=charger_read.id,
        name=charger_read.name,
        occupancy=view.occupancy,
        physical_status=view.physical_status,
        physical_status_source=source or "MANUAL",
        booking_state=view.booking_state,
        driver_message=view.driver_message,
        bookable=view.occupancy == OCCUPANCY_AVAILABLE and charger_read.bookable,
        unexpected_occupancy=view.unexpected_occupancy,
        conflict=view.conflict,
        provenance=view.provenance,
        power_kw=charger_read.power_kw,
        price_per_kwh=charger_read.price_per_kwh,
        latitude=charger_read.latitude,
        longitude=charger_read.longitude,
        poll_hint="Status is refreshed by polling, not a live WebSocket to the driver app.",
    )


def confirm(db: Session, charger_id: str, user_id: str) -> BookingRead:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    charger = _lock_charger(db, charger_id)
    if charger is None:
        charger_service.get_charger(db, charger_id)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This OpenChargeMap charger has no operator row yet, so Fast Track cannot lock it. Choose a VidyutOne station.",
        )
    now = _now()
    bookings = db.query(Booking).filter(Booking.charger_id == charger_id).all()
    booking_state = booking_state_from_rows(bookings, charger_id, now)
    view = occupancy_view(
        physical_status=charger.physical_status,
        booking_state=booking_state,
        status_source=charger.physical_status_source,
        operator_status=charger.status,
    )
    if physically_busy(charger.physical_status) or physically_down(charger.physical_status) or view.occupancy != OCCUPANCY_AVAILABLE:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=OCCUPIED_MESSAGE)

    vehicle = vehicle_service.get_primary_vehicle(db, user_id)
    energy_kwh = charging_service.estimated_energy_kwh(
        battery_capacity_kwh=vehicle.battery_capacity_kwh if vehicle else None,
        current_battery_pct=vehicle.current_battery_pct if vehicle else None,
        charger_power_kw=float(charger.power_kw) if charger.power_kw else 7.4,
        duration_minutes=30,
    )
    price = charging_service.authoritative_session_price(now, float(charger.price_per_kwh), energy_kwh)
    booking = Booking(
        id=str(uuid4()),
        user_id=user_id,
        charger_id=charger.id,
        slot_time=now,
        price=price,
        status=BookingStatus.BOOKED.value,
        duration_minutes=30,
        created_at=utcnow(),
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return BookingRead.model_validate(booking)


def assert_physically_bookable(charger: Charger | None) -> None:
    if charger is None:
        return
    if physically_busy(charger.physical_status) or physically_down(charger.physical_status):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=OCCUPIED_MESSAGE)
    if charger.status == "MAINTENANCE":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=OCCUPIED_MESSAGE)
