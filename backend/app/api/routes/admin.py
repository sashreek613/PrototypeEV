from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.database.session import get_db
from app.schemas.auth import AuthUser, PlannerRejectRequest, ProfileRead
from app.services import user_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/planners", response_model=list[ProfileRead])
def list_planner_requests(
    status: str | None = Query(None, description="Filter by status: pending, approved, rejected"),
    db: Session = Depends(get_db),
    admin: AuthUser = Depends(require_admin),
) -> list[ProfileRead]:
    return user_service.list_planners(db, status_filter=status)


@router.post("/planners/{user_id}/approve", response_model=ProfileRead)
def approve_planner(
    user_id: str,
    db: Session = Depends(get_db),
    admin: AuthUser = Depends(require_admin),
) -> ProfileRead:
    return user_service.approve_planner(db, user_id)


@router.post("/planners/{user_id}/reject", response_model=ProfileRead)
def reject_planner(
    user_id: str,
    payload: PlannerRejectRequest | None = None,
    db: Session = Depends(get_db),
    admin: AuthUser = Depends(require_admin),
) -> ProfileRead:
    reason = payload.rejection_reason if payload else None
    return user_service.reject_planner(db, user_id, reason=reason)
