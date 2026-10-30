from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_planner
from app.database.session import get_db
from app.schemas.auth import AuthUser
from app.schemas.intelligence import CapacityGapRead
from app.services import intelligence_service

router = APIRouter()


@router.get("/planner/capacity-gaps", response_model=list[CapacityGapRead])
def get_capacity_gaps(
    current_user: AuthUser = Depends(require_planner),
    db: Session = Depends(get_db),
) -> list[CapacityGapRead]:
    """Aggregated demand vs capacity by area. No driver identities."""
    return intelligence_service.list_capacity_gaps(db)
