from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class VehicleCreate(BaseModel):
    make: str = Field(..., example="Tata")
    model: str = Field(..., example="Nexon EV")
    battery_capacity_kwh: float = Field(..., gt=0, example=40.5)
    current_battery_pct: float = Field(default=50.0, ge=0, le=100, example=42.0)
    efficiency_wh_km: float = Field(default=150.0, gt=0, example=145.0)
    is_primary: bool = Field(default=True)
    # Registration/purchase date. Optional -- unknown age is a documented
    # no-op in the battery-health range factor (see battery_health_service.py).
    registration_date: date | None = Field(default=None, example="2023-06-15")


class VehicleUpdate(BaseModel):
    make: str | None = None
    model: str | None = None
    battery_capacity_kwh: float | None = Field(default=None, gt=0)
    current_battery_pct: float | None = Field(default=None, ge=0, le=100)
    efficiency_wh_km: float | None = Field(default=None, gt=0)
    is_primary: bool | None = None
    registration_date: date | None = None


class VehicleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    make: str
    model: str
    battery_capacity_kwh: float
    current_battery_pct: float
    efficiency_wh_km: float
    is_primary: bool
    registration_date: date | None = None
    created_at: datetime
    updated_at: datetime


class RangeFactor(BaseModel):
    """One multiplier in range_service.py's transparent adjustment chain
    (temperature / climate control / driving profile / battery health by
    age) -- same "show your work" pattern as ScoredFactorRead on the
    planner side."""

    key: str
    label: str
    multiplier: float
    detail: str


class RangeEstimate(BaseModel):
    battery_capacity_kwh: float
    current_battery_pct: float
    available_kwh: float
    efficiency_wh_km: float
    estimated_range_km: float
    # Reserve-adjusted figures -- see RESERVE_BATTERY_PCT in range_service.py.
    # Real EVs shouldn't be planned down to 0% battery; buffered_range_km is
    # the one the app should use for any "can I reach this charger" decision,
    # estimated_range_km above stays the raw (unbuffered) figure so existing
    # callers reading it keep the behaviour they already had.
    buffered_range_km: float
    reserve_pct: float
    # Environmental/behavioural adjustments (temperature, climate control,
    # driving profile, battery health by age) -- see range_service.py. All
    # optional at the call site and default to multiplier 1.0 (no-op), so
    # this list is always present (4 entries) but has no effect on old
    # callers that don't pass the new query params / vehicle field.
    factors: list[RangeFactor] = []
