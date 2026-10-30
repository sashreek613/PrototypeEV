from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class DriverPreference(str, Enum):
    balanced = "balanced"
    minimize_time = "minimize_time"
    minimize_cost = "minimize_cost"


class IntelligenceRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    preference: DriverPreference = DriverPreference.balanced
    range_km: float | None = Field(None, ge=0)
    energy_kwh: float | None = Field(None, gt=0)
    charger_ids: list[str] | None = None
    hours_ahead: int = Field(18, ge=1, le=48)
    include_demo_tradeoffs: bool = False


class CongestionRead(BaseModel):
    charger_id: str
    level: str
    estimated_wait_minutes: float
    upcoming_bookings_2h: int
    occupancy_now: bool
    busy_period_label: str
    provenance: str
    detail: str


class RecommendedChargerRead(BaseModel):
    charger_id: str
    name: str
    km: float
    power_kw: float | None
    price_per_kwh: float | None
    estimated_wait_minutes: float
    estimated_charge_minutes: float
    estimated_travel_minutes: float
    estimated_cost: float
    energy_kwh: float
    overall_score: float
    congestion: CongestionRead
    station_utilization: float
    why: str
    reachable: bool
    provenance: str


class OptimizerOptionRead(BaseModel):
    kind: str
    charger: RecommendedChargerRead
    reason: str = ""


class AlternativeRead(BaseModel):
    congested: RecommendedChargerRead
    recommended: RecommendedChargerRead
    extra_km: float
    wait_saved_minutes: float
    cost_saved: float
    explanation: str


class SmartTimeRead(BaseModel):
    charger_id: str
    charger_name: str
    slot_iso: str
    label: str
    estimated_cost: float
    current_cost: float
    savings: float
    is_off_peak: bool
    is_peak: bool
    expected_demand: str
    provenance: str
    detail: str


class IntelligenceResponse(BaseModel):
    preference: str
    recommended: RecommendedChargerRead | None
    ranked: list[RecommendedChargerRead]
    congestion: list[CongestionRead]
    optimizer: list[OptimizerOptionRead]
    alternative: AlternativeRead | None
    smart_time: SmartTimeRead | None
    weights: dict[str, float]
    provenance_note: str


class CapacityGapRead(BaseModel):
    cell_id: str
    area_label: str
    latitude: float
    longitude: float
    charger_count: int
    total_kw: float
    bookings_24h: int
    peak_utilization: float
    demand: str
    capacity: str
    expected_congestion: str
    nearest_site_id: str | None
    nearest_site_name: str | None
    site_recommendation: str | None
    action: str
    provenance: str
    detail: str
