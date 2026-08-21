from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.booking import BookingCreate, BookingRead
from app.services import booking_service

router = APIRouter()


@router.post("/bookings", response_model=BookingRead, status_code=status.HTTP_201_CREATED)
def create_booking(payload: BookingCreate, db: Session = Depends(get_db)) -> BookingRead:
    return booking_service.create_booking(db, payload)


@router.get("/bookings/{booking_id}", response_model=BookingRead)
def get_booking(booking_id: str, db: Session = Depends(get_db)) -> BookingRead:
    return booking_service.get_booking(db, booking_id)
