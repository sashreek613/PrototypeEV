"""Dynamic pricing service.

Provides deterministic, time-of-use slot pricing based on grid demand & peak hours.
Helps incentivize off-peak charging to reduce grid stress.
"""

from datetime import datetime, timezone
from typing import TypedDict


class PricingTier(TypedDict):
    slot_iso: str
    price: float
    is_peak: bool
    is_off_peak: bool
    savings_amount: float
    description: str


BASE_RATE = 120.0


def calculate_slot_price(slot_time: datetime, base_price: float = BASE_RATE) -> PricingTier:
    # Ensure UTC
    if slot_time.tzinfo is None:
        slot_time = slot_time.replace(tzinfo=timezone.utc)

    hour = slot_time.hour

    # Peak hours: 18:00 to 21:59 (6 PM - 10 PM)
    if 18 <= hour < 22:
        price = round(base_price * 1.25, 2)
        return {
            "slot_iso": slot_time.isoformat(),
            "price": price,
            "is_peak": True,
            "is_off_peak": False,
            "savings_amount": 0.0,
            "description": "Peak grid demand window. Standard rates apply +25%.",
        }
    # Off-peak hours: 11:00 to 15:59 (Solar peak) and 22:00 to 06:00 (Night low demand)
    elif (11 <= hour < 16) or (hour >= 22 or hour < 6):
        price = round(base_price * 0.80, 2)
        peak_price = round(base_price * 1.25, 2)
        savings = round(peak_price - price, 2)
        return {
            "slot_iso": slot_time.isoformat(),
            "price": price,
            "is_peak": False,
            "is_off_peak": True,
            "savings_amount": savings,
            "description": "Off-peak managed window. Save by charging during high renewable/low grid load hours.",
        }
    else:
        return {
            "slot_iso": slot_time.isoformat(),
            "price": base_price,
            "is_peak": False,
            "is_off_peak": False,
            "savings_amount": 0.0,
            "description": "Standard rate window.",
        }
