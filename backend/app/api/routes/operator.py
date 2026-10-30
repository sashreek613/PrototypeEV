from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_operator
from app.database.session import get_db
from app.schemas.auth import AuthUser
from app.schemas.operator import (
    OperatorAnalyticsRead,
    OperatorBookingRead,
    OperatorChargerCreate,
    OperatorChargerRead,
    OperatorChargerUpdate,
)
from app.services import operator_service
from app.services.operator_demo_store import is_demo_operator
from app.services import operator_demo_store
from app.schemas.fast_track import SimulatePhysicalStatusRequest

router = APIRouter(prefix="/operator", tags=["operator"])


@router.get("/chargers", response_model=list[OperatorChargerRead])
def list_chargers(
    db: Session = Depends(get_db),
    current: AuthUser = Depends(require_operator),
) -> list[OperatorChargerRead]:
    if is_demo_operator(current.id):
        return operator_demo_store.list_chargers()
    return operator_service.list_operator_chargers(db, current.id)


@router.post("/chargers", response_model=OperatorChargerRead)
def create_charger(
    payload: OperatorChargerCreate,
    db: Session = Depends(get_db),
    current: AuthUser = Depends(require_operator),
) -> OperatorChargerRead:
    if is_demo_operator(current.id):
        return operator_demo_store.create_charger(payload)
    return operator_service.create_operator_charger(db, current.id, payload)


@router.patch("/chargers/{charger_id}", response_model=OperatorChargerRead)
def update_charger(
    charger_id: str,
    payload: OperatorChargerUpdate,
    db: Session = Depends(get_db),
    current: AuthUser = Depends(require_operator),
) -> OperatorChargerRead:
    if is_demo_operator(current.id):
        return operator_demo_store.update_charger(charger_id, payload)
    return operator_service.update_operator_charger(db, current.id, charger_id, payload)


@router.post("/chargers/{charger_id}/simulate-status", response_model=OperatorChargerRead)
def simulate_physical_status(
    charger_id: str,
    payload: SimulatePhysicalStatusRequest,
    db: Session = Depends(get_db),
    current: AuthUser = Depends(require_operator),
) -> OperatorChargerRead:
    if is_demo_operator(current.id):
        return operator_demo_store.simulate_physical_status(charger_id, payload)
    return operator_service.simulate_physical_status(db, current.id, charger_id, payload)


@router.get("/bookings", response_model=list[OperatorBookingRead])
def list_bookings(
    db: Session = Depends(get_db),
    current: AuthUser = Depends(require_operator),
) -> list[OperatorBookingRead]:
    if is_demo_operator(current.id):
        return operator_demo_store.list_bookings()
    return operator_service.list_operator_bookings(db, current.id)


@router.get("/analytics", response_model=OperatorAnalyticsRead)
def get_analytics(
    db: Session = Depends(get_db),
    current: AuthUser = Depends(require_operator),
) -> OperatorAnalyticsRead:
    if is_demo_operator(current.id):
        return operator_demo_store.analytics()
    return operator_service.operator_analytics(db, current.id)
