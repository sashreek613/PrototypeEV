from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.assistant import AssistantChatRequest, AssistantChatResponse
from app.services import gemini_service

router = APIRouter()


@router.post("/assistant/chat", response_model=AssistantChatResponse)
def chat_with_assistant(
    payload: AssistantChatRequest,
    db: Session = Depends(get_db),
) -> AssistantChatResponse:
    reply = gemini_service.ask_assistant(db, payload.message, payload.session_id)
    return AssistantChatResponse(reply=reply, session_id=payload.session_id)
