from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.user import ROLE_ADMIN, ROLE_DRIVER, ROLE_OPERATOR, ROLE_PLANNER


class AuthUser(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    is_verified: bool = True
    is_active: bool = True
    verification_status: str = "approved"

    @property
    def is_planner(self) -> bool:
        return self.role == ROLE_PLANNER

    @property
    def is_driver(self) -> bool:
        return self.role == ROLE_DRIVER

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN

    @property
    def is_operator(self) -> bool:
        return self.role == ROLE_OPERATOR


class ProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    full_name: str
    email: str
    role: str
    organization: str | None = None
    phone_number: str | None = None
    designation: str | None = None
    is_verified: bool = True
    is_active: bool = True
    verification_status: str = "approved"
    rejection_reason: str | None = None
    created_at: datetime


class PlannerRejectRequest(BaseModel):
    rejection_reason: str | None = None


