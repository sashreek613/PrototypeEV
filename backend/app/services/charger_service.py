from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.charger import Charger
from app.schemas.charger import ChargerRead


def _to_charger_read(charger: Charger) -> ChargerRead:
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
    )


def list_chargers(db: Session) -> list[ChargerRead]:
    chargers = db.query(Charger).order_by(Charger.name).all()
    return [_to_charger_read(charger) for charger in chargers]


def get_charger(db: Session, charger_id: str) -> ChargerRead:
    charger = db.get(Charger, charger_id)
    if charger is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Charger not found")
    return _to_charger_read(charger)
