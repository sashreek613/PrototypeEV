from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.site import SiteRead
from app.services import site_service

router = APIRouter()


@router.get("/sites", response_model=list[SiteRead])
def get_sites(db: Session = Depends(get_db)) -> list[SiteRead]:
    return site_service.list_sites(db)


@router.get("/sites/{site_id}", response_model=SiteRead)
def get_site(site_id: str, db: Session = Depends(get_db)) -> SiteRead:
    return site_service.get_site(db, site_id)
