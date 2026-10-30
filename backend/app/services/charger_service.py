"""Merge, don't migrate: the driver-facing charger list is DB rows (demo,
bookable) PLUS real OpenChargeMap chargers read straight from
data/chargers_bengaluru.json (not bookable, no site). Real chargers never
get a DB row and never get a fabricated site_id -- Charger.site_id stays a
real NOT NULL FK meaning "installed for this site," which is simply false
for pre-existing real infrastructure. See schemas/charger.py's docstring for
why several fields had to widen to Optional to represent that honestly.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from datetime import datetime, timezone

from app.core.config import get_settings
from app.engines.occupancy import booking_state_from_rows, occupancy_view
from app.models.booking import Booking
from app.models.charger import Charger
from app.schemas.charger import ChargerProvenance, ChargerRead
from app.scripts.fetch_bengaluru_data import fetch_chargers_near
from app.services import mock_store


def _enrich(read: ChargerRead, db: Session, bookings: list[Booking] | None = None) -> ChargerRead:
    now = datetime.now(timezone.utc)
    db_charger = db.get(Charger, read.id)
    rows = bookings
    if rows is None:
        rows = db.query(Booking).filter(Booking.charger_id == read.id).all() if db_charger is not None else []
    booking_state = booking_state_from_rows(rows, read.id, now)
    physical = getattr(db_charger, "physical_status", None) if db_charger is not None else "AVAILABLE"
    source = getattr(db_charger, "physical_status_source", None) if db_charger is not None else "MANUAL"
    view = occupancy_view(
        physical_status=physical,
        booking_state=booking_state,
        status_source=source,
        operator_status=getattr(db_charger, "status", None) if db_charger is not None else None,
    )
    data = read.model_dump()
    data.update(
        {
            "physical_status": view.physical_status,
            "physical_status_source": source,
            "occupancy": view.occupancy,
            "occupancy_detail": view.driver_message,
            "availability": False if view.occupancy != "AVAILABLE" and db_charger is not None else read.availability,
        }
    )
    return ChargerRead.model_validate(data)


def _to_charger_read_from_db(charger: Charger) -> ChargerRead:
    return ChargerRead(
        id=charger.id,
        name=charger.name,
        latitude=charger.latitude,
        longitude=charger.longitude,
        power_kw=charger.power_kw,
        price_per_kwh=charger.price_per_kwh,
        availability=charger.availability,
        connector_type=charger.connector_type,
        site_id=charger.site_id,
        provenance=ChargerProvenance.DEMO,
        bookable=True,
        status=charger.status,
        operator_id=charger.operator_id,
        physical_status=getattr(charger, "physical_status", None),
        physical_status_source=getattr(charger, "physical_status_source", None),
    )


def _to_charger_read_from_real(row: dict[str, Any]) -> ChargerRead:
    settings = get_settings()
    fallback_tariff = settings.DEFAULT_FALLBACK_TARIFF  # e.g. 18.0 INR/kWh
    return ChargerRead(
        id=row["id"],
        name=row["name"],
        latitude=row["latitude"],
        longitude=row["longitude"],
        power_kw=row.get("power_kw"),
        # Apply VidyutOne App Tariff for OCM chargers where OCM pricing is free-text / unavailable
        price_per_kwh=fallback_tariff,
        availability=row.get("availability"),
        connector_type=row.get("connector_type") or "Unknown",
        site_id=None,
        provenance=ChargerProvenance.REAL,
        bookable=True,  # all chargers are bookable via VidyutOne App Tariff
    )


@lru_cache(maxsize=1)
def _real_chargers_cached() -> list[dict[str, Any]]:
    """Same read-through pattern app/engines/site_scoring.py already uses
    for this file. Cache is invalidated by _invalidate_real_chargers_cache()
    after a refresh writes new data -- see refresh_chargers_near() below."""
    return mock_store.load_real_chargers() or []


def _invalidate_real_chargers_cache() -> None:
    _real_chargers_cached.cache_clear()


def list_chargers(db: Session) -> list[ChargerRead]:
    db_rows = db.query(Charger).order_by(Charger.name).all()
    ids = [c.id for c in db_rows]
    bookings = db.query(Booking).filter(Booking.charger_id.in_(ids)).all() if ids else []
    demo = [_enrich(_to_charger_read_from_db(c), db, bookings) for c in db_rows]
    real = [_to_charger_read_from_real(row) for row in _real_chargers_cached()]
    return demo + real


def get_charger(db: Session, charger_id: str) -> ChargerRead:
    charger = db.get(Charger, charger_id)
    if charger is not None:
        return _enrich(_to_charger_read_from_db(charger), db)

    real_row = next((row for row in _real_chargers_cached() if row["id"] == charger_id), None)
    if real_row is not None:
        return _to_charger_read_from_real(real_row)

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Charger not found")


def refresh_chargers_near(latitude: float, longitude: float, radius_km: float) -> list[ChargerRead]:
    """POST /api/chargers/refresh -- the one path that calls OCM live,
    triggered only by an explicit user action (never on page load / battery
    change, see DriverHomePage.tsx). Upserts by id into
    data/chargers_bengaluru.json: rows the live call found are replaced
    with fresher data, everything else already on disk is left untouched.
    """
    settings = get_settings()
    api_key = settings.OCM_API_KEY.strip()
    if not api_key or api_key == "REPLACE_WITH_YOUR_KEY":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OCM_API_KEY is not configured on the server -- live refresh is unavailable.",
        )

    try:
        fresh_rows = fetch_chargers_near(latitude=latitude, longitude=longitude, radius_km=radius_km, api_key=api_key)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"OpenChargeMap request failed: {exc}") from exc

    existing = mock_store.load_real_chargers() or []
    by_id = {row["id"]: row for row in existing}
    for row in fresh_rows:
        by_id[row["id"]] = row
    merged = list(by_id.values())

    data_path = settings.DATA_DIR / "chargers_bengaluru.json"
    data_path.write_text(json.dumps(merged, indent=2), encoding="utf-8")
    _invalidate_real_chargers_cache()

    return [_to_charger_read_from_real(row) for row in fresh_rows]
