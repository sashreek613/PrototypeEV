from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import require_planner
from app.database.session import get_db
from app.schemas.auth import AuthUser
from app.schemas.consideration import ConsiderationRead
from app.services import consideration_service

router = APIRouter()


@router.get("/planner/consideration", response_model=list[ConsiderationRead])
def list_consideration(
    current_user: AuthUser = Depends(require_planner),
    db: Session = Depends(get_db),
) -> list[ConsiderationRead]:
    """Return the authenticated planner's current shortlist."""
    return consideration_service.list_considerations(db, current_user.id)


@router.post(
    "/planner/consideration/{site_id}",
    response_model=ConsiderationRead,
    status_code=status.HTTP_201_CREATED,
)
def add_consideration(
    site_id: str,
    current_user: AuthUser = Depends(require_planner),
    db: Session = Depends(get_db),
) -> ConsiderationRead:
    """Add a site to the planner's shortlist (idempotent)."""
    return consideration_service.add_consideration(db, current_user.id, site_id)


@router.delete(
    "/planner/consideration/{site_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_consideration(
    site_id: str,
    current_user: AuthUser = Depends(require_planner),
    db: Session = Depends(get_db),
) -> None:
    """Remove a site from the planner's shortlist."""
    consideration_service.remove_consideration(db, current_user.id, site_id)
