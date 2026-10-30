"""Planner consideration (site shortlist) service.

Each authenticated planner has their own private shortlist keyed on
(user_id, site_id).  The unique DB constraint prevents duplicates; callers
don't need to check existence before adding.
"""

import logging
import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.consideration import PlannerConsideration
from app.schemas.consideration import ConsiderationRead

logger = logging.getLogger(__name__)


def list_considerations(db: Session, user_id: str) -> list[ConsiderationRead]:
    rows = (
        db.query(PlannerConsideration)
        .filter(PlannerConsideration.user_id == user_id)
        .order_by(PlannerConsideration.added_at.asc())
        .all()
    )
    return [ConsiderationRead.model_validate(r) for r in rows]


def add_consideration(db: Session, user_id: str, site_id: str) -> ConsiderationRead:
    """Add a site to the user's shortlist.

    Silently succeeds if the entry already exists (idempotent).
    """
    existing = (
        db.query(PlannerConsideration)
        .filter(
            PlannerConsideration.user_id == user_id,
            PlannerConsideration.site_id == site_id,
        )
        .first()
    )
    if existing:
        return ConsiderationRead.model_validate(existing)

    row = PlannerConsideration(
        id=str(uuid.uuid4()),
        user_id=user_id,
        site_id=site_id,
    )
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        # Race condition: another request inserted the same pair; re-fetch.
        row = (
            db.query(PlannerConsideration)
            .filter(
                PlannerConsideration.user_id == user_id,
                PlannerConsideration.site_id == site_id,
            )
            .first()
        )
        if row is None:
            raise
    logger.info("Consideration added: user=%s site=%s", user_id, site_id)
    return ConsiderationRead.model_validate(row)


def remove_consideration(db: Session, user_id: str, site_id: str) -> bool:
    """Remove a site from the user's shortlist.

    Returns True if a row was deleted, False if it didn't exist.
    """
    deleted = (
        db.query(PlannerConsideration)
        .filter(
            PlannerConsideration.user_id == user_id,
            PlannerConsideration.site_id == site_id,
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    logger.info("Consideration removed: user=%s site=%s deleted=%s", user_id, site_id, bool(deleted))
    return bool(deleted)
