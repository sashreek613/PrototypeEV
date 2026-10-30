from datetime import datetime, timezone

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.services.pricing_service import calculate_slot_price

router = APIRouter(prefix="/pricing", tags=["pricing"])


class PricingScheduleRequest(BaseModel):
    slots: list[datetime]
    base_price: float = 120.0


@router.get("/calculate")
def get_slot_price(
    slot_time: datetime = Query(...),
    base_price: float = Query(120.0),
):
    return calculate_slot_price(slot_time, base_price)


@router.post("/schedule")
def get_pricing_schedule(payload: PricingScheduleRequest):
    results = [calculate_slot_price(slot, payload.base_price) for slot in payload.slots]
    return {"schedule": results}
