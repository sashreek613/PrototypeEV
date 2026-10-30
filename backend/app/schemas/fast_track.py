from pydantic import BaseModel, Field


class FastTrackCheckRead(BaseModel):
    charger_id: str
    name: str
    occupancy: str
    physical_status: str
    physical_status_source: str
    booking_state: str
    driver_message: str
    bookable: bool
    unexpected_occupancy: bool
    conflict: bool
    provenance: str
    power_kw: float | None = None
    price_per_kwh: float | None = None
    latitude: float | None = None
    longitude: float | None = None
    poll_hint: str


class FastTrackConfirmRequest(BaseModel):
    charger_id: str = Field(..., min_length=1, max_length=64)


class SimulatePhysicalStatusRequest(BaseModel):
    physical_status: str = Field(..., min_length=2, max_length=32)
    source: str = "SIMULATOR"
