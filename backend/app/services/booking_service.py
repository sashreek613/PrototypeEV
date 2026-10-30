from datetime import timedelta, timezone, datetime
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database.session import utcnow
from app.models.booking import Booking
from app.models.charger import Charger
from app.models.user import User
from app.schemas.auth import AuthUser
from app.schemas.booking import BookingCreate, BookingRead, BookingStatus
from app.services import charging_service, vehicle_service
from app.services.fast_track_service import assert_physically_bookable

# Abandoned PAYMENT_PENDING bookings older than this many minutes release the slot automatically
_PAYMENT_PENDING_TTL_MINUTES = 15


def create_booking(db: Session, payload: BookingCreate, user_id: str) -> BookingRead:
    from app.services.charger_service import get_charger as _get_charger_read

    # Resolve charger — DB row for DEMO chargers, OCM data for REAL ones
    db_charger = db.get(Charger, payload.charger_id)
    if db_charger is not None:
        charger_price = db_charger.price_per_kwh
        charger_power = float(db_charger.power_kw) if db_charger.power_kw else 7.4
        charger_obj_for_booking = db_charger  # has FK relationship
        assert_physically_bookable(db_charger)
    else:
        # Try REAL OCM charger
        charger_read = _get_charger_read(db, payload.charger_id)  # raises 404 if missing
        charger_price = charger_read.price_per_kwh
        charger_power = float(charger_read.power_kw) if charger_read.power_kw else 7.4
        db_charger = None
        charger_obj_for_booking = None  # no DB row — booking FK will reference a synth id

    # If charger has no structured price, use the VidyutOne fallback app tariff
    if charger_price is None or charger_price <= 0:
        from app.core.config import get_settings
        charger_price = get_settings().DEFAULT_FALLBACK_TARIFF

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    slot_time = charging_service._aware(payload.slot_time)
    duration_minutes = payload.duration_minutes if (payload.duration_minutes and payload.duration_minutes > 0) else 30

    new_start = slot_time
    new_end = slot_time + timedelta(minutes=duration_minutes)
    now_utc = datetime.now(timezone.utc)
    cutoff = now_utc - timedelta(minutes=_PAYMENT_PENDING_TTL_MINUTES)

    # Collision Prevention: check non-cancelled bookings, skipping stale PAYMENT_PENDING ones
    existing_bookings = (
        db.query(Booking)
        .filter(
            Booking.charger_id == payload.charger_id,
            Booking.status != BookingStatus.CANCELLED.value,
        )
        .all()
    )

    for b in existing_bookings:
        # Skip stale PAYMENT_PENDING bookings — they auto-release after TTL
        if b.status == BookingStatus.PAYMENT_PENDING.value:
            b_created = b.created_at
            if b_created.tzinfo is None:
                b_created = b_created.replace(tzinfo=timezone.utc)
            if b_created < cutoff:
                continue  # expired, slot is free

        b_start = charging_service._aware(b.slot_time)
        b_duration = getattr(b, "duration_minutes", 30) or 30
        b_end = b_start + timedelta(minutes=b_duration)

        # Retrying payment for the same slot must reuse the pending booking
        # instead of colliding with it (Razorpay cancel/retry).
        if (
            b.status == BookingStatus.PAYMENT_PENDING.value
            and b.user_id == user_id
            and b_start == new_start
            and b_duration == duration_minutes
        ):
            return BookingRead.model_validate(b)

        if new_start < b_end and new_end > b_start:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This charging slot is no longer available. Please select another time.",
            )

    vehicle = vehicle_service.get_primary_vehicle(db, user_id)
    energy_kwh = charging_service.estimated_energy_kwh(
        battery_capacity_kwh=vehicle.battery_capacity_kwh if vehicle else None,
        current_battery_pct=vehicle.current_battery_pct if vehicle else None,
        charger_power_kw=charger_power,
        duration_minutes=duration_minutes,
    )
    price = charging_service.authoritative_session_price(
        slot_time,
        charger_price,
        energy_kwh,
    )

    booking = Booking(
        id=str(uuid4()),
        user_id=user_id,
        charger_id=payload.charger_id,
        slot_time=slot_time,
        price=price,
        status=BookingStatus.PAYMENT_PENDING.value,
        duration_minutes=duration_minutes,
        created_at=utcnow(),
    )
    if charger_obj_for_booking is not None:
        booking.charger = charger_obj_for_booking
    db.add(booking)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Could not reserve this charger. Please try another hub or time.",
        ) from exc
    return BookingRead.model_validate(booking)



def get_booking(db: Session, booking_id: str, current_user: AuthUser) -> BookingRead:
    from sqlalchemy.orm import joinedload
    booking = (
        db.query(Booking)
        .options(joinedload(Booking.charger))
        .filter(Booking.id == booking_id)
        .first()
    )
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    if booking.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return BookingRead.model_validate(booking)


def list_bookings(db: Session, user_id: str) -> list[BookingRead]:
    from sqlalchemy.orm import joinedload
    bookings = (
        db.query(Booking)
        .options(joinedload(Booking.charger))
        .filter(Booking.user_id == user_id)
        .all()
    )
    return [BookingRead.model_validate(b) for b in bookings]


def cancel_booking(db: Session, booking_id: str, current_user: AuthUser) -> BookingRead:
    from datetime import datetime, timezone, timedelta
    from sqlalchemy.orm import joinedload
    booking = (
        db.query(Booking)
        .options(joinedload(Booking.charger))
        .filter(Booking.id == booking_id)
        .first()
    )
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    if booking.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        
    resolved_status = booking.resolved_status
            
    if resolved_status == BookingStatus.CANCELLED.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Booking already cancelled")
    elif resolved_status == BookingStatus.ACTIVE.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot cancel an active booking")
    elif resolved_status == BookingStatus.COMPLETED.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot cancel a completed booking")
        
    now = datetime.now(timezone.utc)
    slot_time = booking.slot_time
    if slot_time.tzinfo is None:
        slot_time = slot_time.replace(tzinfo=timezone.utc)
    if now >= slot_time:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot cancel a booking after the charging window has started")

    booking.status = BookingStatus.CANCELLED.value
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return BookingRead.model_validate(booking)
