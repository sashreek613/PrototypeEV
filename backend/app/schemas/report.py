from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ReportCreate(BaseModel):
    site_ids: list[str]
    title: str = "EV Infrastructure Site Assessment"
    division: str | None = None


class ReportRead(BaseModel):
    """A generated planner site-assessment report."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    site_ids: list[str]
    division: str | None
    created_at: datetime
