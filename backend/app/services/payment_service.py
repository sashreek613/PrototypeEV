"""
Payment service — creates Razorpay orders and verifies payment signatures.
The Razorpay secret is never exposed to the frontend.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.database.session import utcnow
from app.models.booking import Booking
from app.models.payment import Payment
from app.schemas.booking import BookingStatus
from app.schemas.payment import (
    CreateOrderRequest,
    CreateOrderResponse,
    VerifyPaymentRequest,
    VerifyPaymentResponse,
)

logger = logging.getLogger(__name__)


def _razorpay_client():
    import razorpay  # local import so server starts even if key is empty during tests
    settings = get_settings()
    key_id = settings.RAZORPAY_KEY_ID.strip()
    secret = settings.RAZORPAY_KEY_SECRET.strip()
    if not key_id or not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment gateway not configured. Please contact support.",
        )
    return razorpay.Client(auth=(key_id, secret))


def create_order(
    db: Session, payload: CreateOrderRequest, user_id: str
) -> CreateOrderResponse:
    """
    1. Fetch the booking and verify it belongs to the current user.
    2. Ensure it is in PAYMENT_PENDING state.
    3. Create a Razorpay order for the exact booking amount.
    4. Persist the razorpay_order_id on the Payment record.
    """
    booking = db.get(Booking, payload.booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.user_id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    if booking.status != BookingStatus.PAYMENT_PENDING.value:
        raise HTTPException(
            status_code=400,
            detail=f"Booking is in status '{booking.status}', not PAYMENT_PENDING.",
        )

    # Amount always comes from the persisted booking price, never the client payload.
    amount_paise = int(round(booking.price * 100))  # Razorpay uses smallest currency unit

    client = _razorpay_client()
    try:
        order_data = client.order.create(
            {
                "amount": amount_paise,
                "currency": payload.currency,
                "payment_capture": 1,
                "notes": {
                    "booking_id": booking.id,
                    "user_id": user_id,
                },
            }
        )
    except Exception as exc:
        message = str(exc).lower()
        if "auth" in message:
            logger.exception("Razorpay order creation failed category=invalid_credentials")
            raise HTTPException(
                status_code=502,
                detail="Payment gateway authentication failed. Check Razorpay test credentials.",
            )
        logger.exception("Razorpay order creation failed category=gateway_error")
        raise HTTPException(status_code=502, detail="Payment gateway error. Please try again.")

    razorpay_order_id: str = order_data["id"]

    # Upsert Payment record
    payment = (
        db.query(Payment)
        .filter(Payment.booking_id == booking.id)
        .first()
    )
    if payment is None:
        payment = Payment(
            id=str(uuid4()),
            booking_id=booking.id,
            user_id=user_id,
            amount=booking.price,
            currency=payload.currency,
            payment_method="razorpay",
            payment_status="PENDING",
            razorpay_order_id=razorpay_order_id,
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        db.add(payment)
    else:
        payment.razorpay_order_id = razorpay_order_id
        payment.payment_status = "PENDING"
        payment.updated_at = utcnow()

    db.commit()

    settings = get_settings()
    return CreateOrderResponse(
        razorpay_order_id=razorpay_order_id,
        amount_paise=amount_paise,
        currency=payload.currency,
        razorpay_key_id=settings.RAZORPAY_KEY_ID,
    )


def verify_payment(
    db: Session, payload: VerifyPaymentRequest, user_id: str
) -> VerifyPaymentResponse:
    """
    Verify HMAC signature from Razorpay webhook/response.
    On success: booking → BOOKED, payment → PAID.
    On failure: payment → FAILED (booking stays PAYMENT_PENDING for retry).
    """
    booking = db.get(Booking, payload.booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.user_id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    payment = (
        db.query(Payment)
        .filter(Payment.booking_id == booking.id)
        .first()
    )
    if payment is None:
        raise HTTPException(status_code=404, detail="Payment record not found")

    if (
        payment.razorpay_order_id
        and payload.razorpay_order_id != payment.razorpay_order_id
    ):
        raise HTTPException(status_code=400, detail="Payment order mismatch. Please retry.")

    settings = get_settings()
    secret = settings.RAZORPAY_KEY_SECRET.strip()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment gateway not configured. Please contact support.",
        )

    # Idempotent: already verified this payment
    if (
        payment.payment_status == "PAID"
        and booking.status == BookingStatus.BOOKED.value
        and payment.razorpay_payment_id == payload.razorpay_payment_id
    ):
        return VerifyPaymentResponse(
            success=True,
            booking_id=booking.id,
            payment_status="PAID",
            booking_status="BOOKED",
            message="Payment confirmed. Your charging session is booked!",
        )

    # Verify signature: HMAC-SHA256(order_id + "|" + payment_id, secret)
    expected = hmac.new(
        secret.encode("utf-8"),
        f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, payload.razorpay_signature):
        # Signature mismatch — mark payment failed but allow retry
        payment.payment_status = "FAILED"
        payment.updated_at = utcnow()
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="Payment verification failed. Please try again or contact support.",
        )

    # Success — confirm booking
    booking.status = BookingStatus.BOOKED.value
    payment.payment_status = "PAID"
    payment.razorpay_payment_id = payload.razorpay_payment_id
    payment.razorpay_signature = payload.razorpay_signature
    payment.updated_at = utcnow()
    db.commit()
    db.refresh(booking)

    return VerifyPaymentResponse(
        success=True,
        booking_id=booking.id,
        payment_status="PAID",
        booking_status="BOOKED",
        message="Payment confirmed. Your charging session is booked!",
    )
