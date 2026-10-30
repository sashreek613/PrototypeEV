from pydantic import BaseModel


class AssistantChatRequest(BaseModel):
    message: str
    session_id: str


class AssistantChatResponse(BaseModel):
    reply: str
    session_id: str
