from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.charger import ChargerRead
from app.services import charger_service
from app.services.demo_intelligence import demo_charger_by_id, request_allows_demo

router = APIRouter()


@router.get("/chargers", response_model=list[ChargerRead])
def get_chargers(db: Session = Depends(get_db)) -> list[ChargerRead]:
    return charger_service.list_chargers(db)


@router.post("/chargers/refresh", response_model=list[ChargerRead])
def refresh_chargers(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(10.0, gt=0, le=50),
) -> list[ChargerRead]:
    """Explicit, user-triggered live OCM call for the given area -- never
    called automatically. See charger_service.refresh_chargers_near."""
    return charger_service.refresh_chargers_near(latitude=lat, longitude=lon, radius_km=radius_km)


@router.get("/chargers/{charger_id}", response_model=ChargerRead)
def get_charger(charger_id: str, request: Request, db: Session = Depends(get_db)) -> ChargerRead:
    if request_allows_demo(request.headers.get("origin")):
        demo = demo_charger_by_id(charger_id)
        if demo is not None:
            return demo
    return charger_service.get_charger(db, charger_id)
