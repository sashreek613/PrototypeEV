from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_driver, require_operator, require_planner
from app.database.session import get_db
from app.models.user import User
from app.schemas.auth import AuthUser, ProfileRead
from app.services.operator_demo_store import is_demo_operator, demo_profile

router = APIRouter()


def _profile_or_404(db: Session, user_id: str) -> ProfileRead:
    profile = db.get(User, user_id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return ProfileRead.model_validate(profile)


@router.get("/me", response_model=ProfileRead)
def read_me(current: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)) -> ProfileRead:
    if is_demo_operator(current.id):
        return demo_profile()
    return _profile_or_404(db, current.id)


@router.get("/me/planner", response_model=ProfileRead)
def read_planner_me(
    current: AuthUser = Depends(require_planner),
    db: Session = Depends(get_db),
) -> ProfileRead:
    return _profile_or_404(db, current.id)


@router.get("/me/driver", response_model=ProfileRead)
def read_driver_me(
    current: AuthUser = Depends(require_driver),
    db: Session = Depends(get_db),
) -> ProfileRead:
    return _profile_or_404(db, current.id)


@router.get("/me/operator", response_model=ProfileRead)
def read_operator_me(
    current: AuthUser = Depends(require_operator),
    db: Session = Depends(get_db),
) -> ProfileRead:
    if is_demo_operator(current.id):
        return demo_profile()
    return _profile_or_404(db, current.id)
