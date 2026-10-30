from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


OPERATOR_CHARGER_STATUSES = frozenset({"AVAILABLE", "OFFLINE", "MAINTENANCE"})


class OperatorChargerCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    power_kw: float = Field(..., gt=0, le=500)
    price_per_kwh: float = Field(..., gt=0, le=200)
    connector_type: str = Field("CCS2", max_length=64)
    status: str = "AVAILABLE"


class OperatorChargerUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=255)
    power_kw: float | None = Field(None, gt=0, le=500)
    price_per_kwh: float | None = Field(None, gt=0, le=200)
    connector_type: str | None = Field(None, max_length=64)
    status: str | None = None
    availability: bool | None = None


class OperatorChargerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    latitude: float
    longitude: float
    power_kw: float
    price_per_kwh: float
    connector_type: str
    status: str
    availability: bool
    occupancy: str
    site_id: str | None
    created_at: datetime
    physical_status: str | None = None
    physical_status_source: str | None = None
    unexpected_occupancy: bool = False
    occupancy_detail: str | None = None
    qr_path: str | None = None


class OperatorBookingRead(BaseModel):
    id: str
    charger_id: str
    charger_name: str
    slot_time: datetime
    duration_minutes: int
    price: float
    status: str
    window_label: str


class OperatorInsightRead(BaseModel):
    kind: str
    title: str
    body: str
    provenance: str
    charger_id: str | None = None
    charger_name: str | None = None


class OperatorAnalyticsRead(BaseModel):
    total_stations: int
    total_chargers: int
    available_chargers: int
    occupied_chargers: int
    maintenance_chargers: int
    upcoming_bookings: int
    total_bookings: int
    utilization_pct: float
    revenue: float
    average_booking_value: float | None = None
    peak_usage_period: str | None
    repeat_users: int | None
    insights: list[OperatorInsightRead]
    station_insights: list[OperatorInsightRead] = []
    provenance_note: str
