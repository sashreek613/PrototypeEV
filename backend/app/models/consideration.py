from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base, utcnow


class PlannerConsideration(Base):
    """A single site shortlisted by a planner user.

    The unique constraint on (user_id, site_id) prevents duplicate entries
    without requiring callers to check first -- use INSERT OR IGNORE / ON
    CONFLICT DO NOTHING at the service layer.
    """

    __tablename__ = "planner_considerations"
    __table_args__ = (
        UniqueConstraint("user_id", "site_id", name="uq_consideration_user_site"),
    )

    id: Mapped[str] = mapped_column(
        String(64),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    user_id: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
    )
    site_id: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
    )
