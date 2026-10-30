from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import require_driver
from app.database.session import get_db
from app.models.charger import Charger
from app.schemas.auth import AuthUser
from app.schemas.charging import (
    ChargingQuoteRead,
    ChargingQuoteRequest,
    ChargingSessionRead,
    ChargingSummaryRead,
)
from app.schemas.driver_assistant import DriverAssistantChatRequest, DriverAssistantChatResponse
from app.schemas.intelligence import IntelligenceRequest, IntelligenceResponse
from app.services import charging_service, intelligence_service, lyzr_driver_service
from app.services.demo_intelligence import request_allows_demo

router = APIRouter()


@router.get("/driver/charging-summary", response_model=ChargingSummaryRead)
def get_charging_summary(
    db: Session = Depends(get_db),
    current: AuthUser = Depends(require_driver),
) -> ChargingSummaryRead:
    return charging_service.build_charging_summary(db, current.id)


@router.get("/driver/charging-history", response_model=list[ChargingSessionRead])
def get_charging_history(
    db: Session = Depends(get_db),
    current: AuthUser = Depends(require_driver),
) -> list[ChargingSessionRead]:
    return charging_service.list_charging_history(db, current.id)


@router.post("/driver/charging-quote", response_model=ChargingQuoteRead)
def post_charging_quote(
    payload: ChargingQuoteRequest,
    db: Session = Depends(get_db),
    current: AuthUser = Depends(require_driver),
) -> ChargingQuoteRead:
    from app.services import charger_service
    charger = charger_service.get_charger(db, payload.charger_id)
    duration = payload.duration_minutes or 30
    return charging_service.quote_charging_slots(db, current.id, charger, payload.slots, duration_minutes=duration)


@router.post("/driver/voice-assistant", response_model=DriverAssistantChatResponse)
def post_voice_assistant(
    payload: DriverAssistantChatRequest,
    current: AuthUser = Depends(require_driver),
) -> DriverAssistantChatResponse:
    reply = lyzr_driver_service.ask_driver_assistant(payload.message, payload.session_id, payload.context_summary)
    return DriverAssistantChatResponse(reply=reply)


@router.post("/driver/intelligence", response_model=IntelligenceResponse)
def post_driver_intelligence(
    payload: IntelligenceRequest,
    request: Request,
    db: Session = Depends(get_db),
    current: AuthUser = Depends(require_driver),
) -> IntelligenceResponse:
    include_demo = payload.include_demo_tradeoffs and request_allows_demo(request.headers.get("origin"))
    return intelligence_service.build_intelligence(db, current.id, payload, include_demo=include_demo)
