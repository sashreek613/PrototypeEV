"""Planner report service.

Reports are created from a specific set of site IDs that the planner
deliberately selected in the Consideration tab -- they are never
auto-populated from all sites.
"""

import json
import logging
import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.report import PlannerReport
from app.schemas.report import ReportCreate, ReportRead

logger = logging.getLogger(__name__)


def _to_read(row: PlannerReport) -> ReportRead:
    return ReportRead(
        id=row.id,
        title=row.title,
        site_ids=json.loads(row.site_ids_json),
        division=row.division,
        created_at=row.created_at,
    )


def list_reports(db: Session, user_id: str) -> list[ReportRead]:
    rows = (
        db.query(PlannerReport)
        .filter(PlannerReport.user_id == user_id)
        .order_by(PlannerReport.created_at.desc())
        .all()
    )
    return [_to_read(r) for r in rows]


def create_report(db: Session, user_id: str, payload: ReportCreate) -> ReportRead:
    if not payload.site_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one site must be selected to generate a report.",
        )
    row = PlannerReport(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=payload.title,
        site_ids_json=json.dumps(payload.site_ids),
        division=payload.division,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info(
        "Report created: user=%s report=%s sites=%d",
        user_id,
        row.id,
        len(payload.site_ids),
    )
    return _to_read(row)


def get_report(db: Session, user_id: str, report_id: str) -> ReportRead:
    row = (
        db.query(PlannerReport)
        .filter(PlannerReport.id == report_id, PlannerReport.user_id == user_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
    return _to_read(row)


def delete_report(db: Session, user_id: str, report_id: str) -> None:
    deleted = (
        db.query(PlannerReport)
        .filter(PlannerReport.id == report_id, PlannerReport.user_id == user_id)
        .delete(synchronize_session=False)
    )
    db.commit()
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
