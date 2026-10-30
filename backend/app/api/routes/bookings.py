from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_driver
from app.database.session import get_db
from app.schemas.auth import AuthUser
from app.schemas.booking import BookingCreate, BookingRead
from app.services import booking_service

router = APIRouter()


@router.post("/bookings", response_model=BookingRead, status_code=status.HTTP_201_CREATED)
def create_booking(
    payload: BookingCreate,
    db: Session = Depends(get_db),
    current: AuthUser = Depends(require_driver),
) -> BookingRead:
    return booking_service.create_booking(db, payload, current.id)


@router.get("/bookings", response_model=list[BookingRead])
def list_bookings(
    db: Session = Depends(get_db),
    current: AuthUser = Depends(require_driver),
) -> list[BookingRead]:
    return booking_service.list_bookings(db, current.id)


@router.get("/bookings/{booking_id}", response_model=BookingRead)
def get_booking(
    booking_id: str,
    db: Session = Depends(get_db),
    current: AuthUser = Depends(get_current_user),
) -> BookingRead:
    return booking_service.get_booking(db, booking_id, current)


@router.patch("/bookings/{booking_id}/cancel", response_model=BookingRead)
def cancel_booking(
    booking_id: str,
    db: Session = Depends(get_db),
    current: AuthUser = Depends(require_driver),
) -> BookingRead:
    return booking_service.cancel_booking(db, booking_id, current)
