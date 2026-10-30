"""Local-only driver comparison trade-off chargers.

These rows are never written to Postgres and are not OCPP telemetry.
They are injected only when the request Origin is localhost/127.0.0.1
or DEMO_FEATURES is enabled, so production scoring stays on real data.
"""

from __future__ import annotations

from datetime import datetime

from app.engines.network_intelligence import BookingSnap
from app.schemas.charger import ChargerProvenance, ChargerRead

DEMO_FAST_ID = "demo-intel-fast"
DEMO_CHEAP_ID = "demo-intel-cheap"
DEMO_BALANCED_ID = "demo-intel-balanced"
DEMO_TRADEOFF_IDS = frozenset({DEMO_FAST_ID, DEMO_CHEAP_ID, DEMO_BALANCED_ID})


def request_allows_demo(origin: str | None) -> bool:
    from app.core.config import get_settings

    if getattr(get_settings(), "DEMO_FEATURES", False):
        return True
    value = (origin or "").strip().lower()
    return value.startswith("http://localhost:") or value.startswith("http://127.0.0.1:")


def tradeoff_chargers(origin_lat: float = 12.9716, origin_lon: float = 77.5946) -> list[ChargerRead]:
    """Three clearly differentiated DEMO chargers near the search origin.

    Offsets are degrees (~1 km latitude ≈ 0.009). Not written to Postgres.
    """
    specs = (
        (DEMO_FAST_ID, "Demo Rapid Hub", 0.013, 0.004, 350.0, 32.0, "CCS2", "fast, higher tariff"),
        (DEMO_CHEAP_ID, "Demo Economy Hub", -0.038, 0.016, 50.0, 11.0, "Type 2", "slower, lower tariff"),
        (DEMO_BALANCED_ID, "Demo Balanced Hub", 0.006, 0.022, 150.0, 18.0, "CCS2", "mid power and tariff"),
    )
    rows: list[ChargerRead] = []
    for charger_id, name, dlat, dlon, power, price, connector, hint in specs:
        rows.append(
            ChargerRead(
                id=charger_id,
                name=name,
                latitude=origin_lat + dlat,
                longitude=origin_lon + dlon,
                power_kw=power,
                price_per_kwh=price,
                availability=True,
                connector_type=connector,
                site_id=None,
                provenance=ChargerProvenance.DEMO,
                bookable=False,
                status="AVAILABLE",
                physical_status="AVAILABLE",
                physical_status_source="MANUAL",
                occupancy="AVAILABLE",
                occupancy_detail=f"Demo trade-off charger — {hint}. Not OCPP telemetry.",
            )
        )
    return rows


def tradeoff_bookings(now: datetime | None = None) -> list[BookingSnap]:
    """Keep all three DEMO plugs eligible (not occupied now).

    An overlapping booking would mark the rapid hub occupied and exclude it
    from FASTEST/CHEAPEST/BEST OVERALL. These rows are not OCPP telemetry.
    """
    del now
    return []


def merge_demo_chargers(
    existing: list[ChargerRead],
    *,
    allowed: bool,
    origin_lat: float | None = None,
    origin_lon: float | None = None,
) -> list[ChargerRead]:
    if not allowed:
        return existing
    extras = tradeoff_chargers(
        origin_lat=12.9716 if origin_lat is None else origin_lat,
        origin_lon=77.5946 if origin_lon is None else origin_lon,
    )
    without = [row for row in existing if row.id not in DEMO_TRADEOFF_IDS]
    return extras + without


def demo_charger_by_id(charger_id: str) -> ChargerRead | None:
    for row in tradeoff_chargers():
        if row.id == charger_id:
            return row
    return None
