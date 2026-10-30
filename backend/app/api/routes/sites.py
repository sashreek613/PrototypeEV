from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.site import ClassifiedSiteRead, LocationSuggestion, RecommendedSiteRead, SiteRead
from app.services import site_service

router = APIRouter()


# /sites/recommended, /sites/classify, and /sites/suggest are all registered
# before /sites/{site_id} so FastAPI matches these paths first -- otherwise
# e.g. "recommended" would be captured as a site_id.
@router.get("/sites/recommended", response_model=list[RecommendedSiteRead])
def get_recommended_sites(
    limit: int = Query(site_service.DEFAULT_RECOMMENDED_LIMIT, ge=1, le=site_service.MAX_RECOMMENDED_LIMIT),
    db: Session = Depends(get_db),
) -> list[RecommendedSiteRead]:
    return site_service.list_recommended_sites(db, limit=limit)


@router.get("/sites/suggest", response_model=list[LocationSuggestion])
def suggest_sites(
    q: str = Query(..., min_length=1, description="Partial or full place name"),
    limit: int = Query(site_service.DEFAULT_SUGGEST_LIMIT, ge=1, le=site_service.MAX_SUGGEST_LIMIT),
) -> list[LocationSuggestion]:
    return site_service.suggest_locations(q, limit=limit)


@router.get("/sites/classify", response_model=ClassifiedSiteRead)
def classify_site(
    lat: float | None = Query(None, ge=-90, le=90),
    lon: float | None = Query(None, ge=-180, le=180),
    q: str | None = Query(None, min_length=1, description="Place name -- alternative to lat/lon"),
    db: Session = Depends(get_db),
) -> ClassifiedSiteRead:
    return site_service.classify(db, latitude=lat, longitude=lon, query=q)


@router.get("/sites", response_model=list[SiteRead])
def get_sites(
    limit: int = Query(site_service.DEFAULT_PAGE_SIZE, ge=1, le=site_service.MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> list[SiteRead]:
    return site_service.list_sites(db, limit=limit, offset=offset)


@router.get("/sites/{site_id}", response_model=SiteRead)
def get_site(site_id: str, db: Session = Depends(get_db)) -> SiteRead:
    return site_service.get_site(db, site_id)
