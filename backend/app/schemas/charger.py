from enum import Enum

from pydantic import BaseModel, ConfigDict


class ChargerProvenance(str, Enum):
    DEMO = "DEMO"  # a `chargers` DB row, linked to a site, bookable
    REAL = "REAL"  # from data/chargers_bengaluru.json (OpenChargeMap), not bookable


class ChargerBase(BaseModel):
    name: str
    latitude: float
    longitude: float
    # Widened from the original DEMO-only shape (int / float / bool / str,
    # all required) to accommodate REAL entries honestly: OCM doesn't always
    # report power or price, has no site, and its availability is
    # infrastructure-operational status, not live per-plug occupancy -- see
    # ChargerRead.availability. DEMO rows still always populate every one of
    # these; only REAL rows ever leave them None. Not a rename of any field.
    power_kw: float | None  # OCM reports fractional values too (e.g. 3.6 kW AC) -- int would reject those
    price_per_kwh: float | None
    availability: bool | None
    connector_type: str
    site_id: str | None


class ChargerRead(ChargerBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    provenance: ChargerProvenance
    bookable: bool
    status: str | None = None
    operator_id: str | None = None
    physical_status: str | None = None
    physical_status_source: str | None = None
    occupancy: str | None = None
    occupancy_detail: str | None = None
