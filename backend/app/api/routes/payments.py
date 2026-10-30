"""
Payment routes: create Razorpay order + verify payment signature.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.schemas.auth import AuthUser
from app.schemas.payment import (
    CreateOrderRequest,
    CreateOrderResponse,
    VerifyPaymentRequest,
    VerifyPaymentResponse,
)
from app.services import payment_service

router = APIRouter(prefix="/payments")


@router.post("/create-order", response_model=CreateOrderResponse)
def create_payment_order(
    payload: CreateOrderRequest,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Creates a Razorpay order for a PAYMENT_PENDING booking.
    Returns order details + the public key_id for the frontend checkout.
    Never exposes RAZORPAY_KEY_SECRET.
    """
    return payment_service.create_order(db, payload, current_user.id)


@router.post("/verify", response_model=VerifyPaymentResponse)
def verify_payment(
    payload: VerifyPaymentRequest,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Verifies Razorpay payment signature on the backend.
    On success, transitions booking to BOOKED and payment to PAID.
    """
    return payment_service.verify_payment(db, payload, current_user.id)
