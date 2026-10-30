from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ConsiderationRead(BaseModel):
    """One entry in a planner's site shortlist."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    site_id: str
    added_at: datetime


class ConsiderationCreate(BaseModel):
    site_id: str
