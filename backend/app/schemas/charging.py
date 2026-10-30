from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas.booking import BookingStatus


class ChargingSessionRead(BaseModel):
    booking_id: str
    charger_id: str
    station_name: str
    slot_time: datetime
    window_label: str
    is_peak: bool
    is_off_peak: bool
    energy_kwh: float | None
    cost: float
    savings: float | None
    status: BookingStatus


class MonthlyChargingSummary(BaseModel):
    sessions: int
    cost: float | None
    savings: float | None
    energy_kwh: float | None
    avg_cost_per_session: float | None
    avg_cost_per_kwh: float | None


class MonthlyTrendPoint(BaseModel):
    month: str
    label: str
    cost: float
    energy_kwh: float | None


class ChargingInsight(BaseModel):
    kind: Literal["saved", "could_save"]
    amount: float
    text: str


class ChargingSummaryRead(BaseModel):
    history: list[ChargingSessionRead]
    month: MonthlyChargingSummary
    trend: list[MonthlyTrendPoint]
    last_session: ChargingSessionRead | None
    insight: ChargingInsight | None
    total_energy_kwh: float | None


class ChargingQuoteRequest(BaseModel):
    charger_id: str
    slots: list[datetime]
    duration_minutes: int | None = 30


class ChargingSlotQuote(BaseModel):
    slot_time: datetime
    tariff_per_kwh: float
    total: float
    is_peak: bool
    is_off_peak: bool
    savings_amount: float
    description: str
    window_label: str


class ChargingQuoteRead(BaseModel):
    energy_kwh: float
    quotes: list[ChargingSlotQuote]
