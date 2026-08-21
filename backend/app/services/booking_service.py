from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import utcnow
from app.models.booking import Booking
from app.models.charger import Charger
from app.models.user import User
from app.schemas.booking import BookingCreate, BookingRead, BookingStatus


def create_booking(db: Session, payload: BookingCreate) -> BookingRead:
    charger = db.get(Charger, payload.charger_id)
    if charger is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Charger not found")

    user = db.get(User, payload.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    booking = Booking(
        id=str(uuid4()),
        user_id=payload.user_id,
        charger_id=payload.charger_id,
        slot_time=payload.slot_time,
        price=payload.price,
        status=BookingStatus.BOOKED.value,
        created_at=utcnow(),
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return BookingRead.model_validate(booking)


def get_booking(db: Session, booking_id: str) -> BookingRead:
    booking = db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return BookingRead.model_validate(booking)
