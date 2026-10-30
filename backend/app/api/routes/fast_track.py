from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_driver
from app.database.session import get_db
from app.schemas.auth import AuthUser
from app.schemas.booking import BookingRead
from app.schemas.fast_track import FastTrackCheckRead, FastTrackConfirmRequest
from app.services import fast_track_service

router = APIRouter()


@router.get("/chargers/{charger_id}/live-status", response_model=FastTrackCheckRead)
def get_live_status(
    charger_id: str,
    current: AuthUser = Depends(require_driver),
    db: Session = Depends(get_db),
) -> FastTrackCheckRead:
    return fast_track_service.live_view(db, charger_id)


@router.post("/driver/fast-track/check", response_model=FastTrackCheckRead)
def post_fast_track_check(
    payload: FastTrackConfirmRequest,
    current: AuthUser = Depends(require_driver),
    db: Session = Depends(get_db),
) -> FastTrackCheckRead:
    return fast_track_service.live_view(db, payload.charger_id)


@router.post("/driver/fast-track/confirm", response_model=BookingRead)
def post_fast_track_confirm(
    payload: FastTrackConfirmRequest,
    current: AuthUser = Depends(require_driver),
    db: Session = Depends(get_db),
) -> BookingRead:
    return fast_track_service.confirm(db, payload.charger_id, current.id)
