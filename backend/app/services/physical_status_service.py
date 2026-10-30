"""Single writer for charger physical status.

OCPP StatusNotification and the operator simulator both call apply_status.
They must not invent a second occupancy model.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import utcnow
from app.engines.occupancy import (
    SOURCE_MANUAL,
    VALID_PHYSICAL_STATUSES,
    VALID_STATUS_SOURCES,
    normalize_physical,
)
from app.models.charger import Charger


def apply_status(
    db: Session,
    *,
    charger: Charger,
    physical_status: str,
    source: str,
    commit: bool = True,
) -> Charger:
    status_value = normalize_physical(physical_status)
    if status_value not in VALID_PHYSICAL_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid physical status.")
    source_value = (source or SOURCE_MANUAL).upper()
    if source_value not in VALID_STATUS_SOURCES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status source.")
    charger.physical_status = status_value
    charger.physical_status_source = source_value
    charger.physical_status_updated_at = utcnow()
    if status_value in {"UNAVAILABLE", "FAULTED"}:
        charger.availability = False
    elif status_value == "AVAILABLE":
        charger.availability = True
    db.add(charger)
    if commit:
        db.commit()
        db.refresh(charger)
    return charger


def charger_by_ocpp_identity(db: Session, identity: str) -> Charger | None:
    row = db.query(Charger).filter(Charger.ocpp_identity == identity).one_or_none()
    if row is not None:
        return row
    return db.get(Charger, identity)


def apply_status_by_identity(
    db: Session,
    *,
    identity: str,
    physical_status: str,
    source: str,
) -> Charger:
    charger = charger_by_ocpp_identity(db, identity)
    if charger is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Charger not found")
    return apply_status(db, charger=charger, physical_status=physical_status, source=source)
