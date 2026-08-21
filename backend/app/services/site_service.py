from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.engines.recommendation import compute_site_score, recommend_site
from app.models.site import Site
from app.schemas.site import SiteRead


def _to_site_read(site: Site) -> SiteRead:
    return SiteRead(
        id=site.id,
        name=site.name,
        latitude=site.latitude,
        longitude=site.longitude,
        demand_score=site.demand_score,
        grid_capacity_score=site.grid_capacity_score,
        accessibility_score=site.accessibility_score,
        charger_gap_score=site.charger_gap_score,
        site_score=compute_site_score(
            site.demand_score,
            site.grid_capacity_score,
            site.accessibility_score,
            site.charger_gap_score,
        ),
        recommendation=recommend_site(site.demand_score, site.grid_capacity_score),
    )


def list_sites(db: Session) -> list[SiteRead]:
    sites = db.query(Site).order_by(Site.name).all()
    return [_to_site_read(site) for site in sites]


def get_site(db: Session, site_id: str) -> SiteRead:
    site = db.get(Site, site_id)
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    return _to_site_read(site)
