from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class CreateOrderRequest(BaseModel):
    booking_id: str
    amount: float           # in INR (will be converted to paise for Razorpay)
    currency: str = "INR"


class CreateOrderResponse(BaseModel):
    razorpay_order_id: str
    amount_paise: int       # paise for Razorpay checkout
    currency: str
    razorpay_key_id: str    # safe to expose — NOT the secret


class VerifyPaymentRequest(BaseModel):
    booking_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class VerifyPaymentResponse(BaseModel):
    success: bool
    booking_id: str
    payment_status: str
    booking_status: str
    message: str


class PaymentRead(BaseModel):
    id: str
    booking_id: str
    user_id: str
    amount: float
    currency: str
    payment_method: str
    payment_status: str
    razorpay_order_id: str | None
    razorpay_payment_id: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
