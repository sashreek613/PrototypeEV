from pydantic import BaseModel


class DriverAssistantChatRequest(BaseModel):
    message: str
    session_id: str
    # Built entirely on the frontend from data it already computed (the
    # `recommended` list + bufferedRangeKm) -- see
    # VoiceAssistantButton.tsx. The backend never recomputes or fetches
    # charger/range data for this endpoint; it only forwards this string.
    context_summary: str


class DriverAssistantChatResponse(BaseModel):
    reply: str
