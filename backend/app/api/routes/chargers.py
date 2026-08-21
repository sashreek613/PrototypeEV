from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.charger import ChargerRead
from app.services import charger_service

router = APIRouter()


@router.get("/chargers", response_model=list[ChargerRead])
def get_chargers(db: Session = Depends(get_db)) -> list[ChargerRead]:
    return charger_service.list_chargers(db)


@router.get("/chargers/{charger_id}", response_model=ChargerRead)
def get_charger(charger_id: str, db: Session = Depends(get_db)) -> ChargerRead:
    return charger_service.get_charger(db, charger_id)
