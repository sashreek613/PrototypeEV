from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base, utcnow


class Site(Base):
    __tablename__ = "sites"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    demand_score: Mapped[float] = mapped_column(Float, nullable=False)
    grid_capacity_score: Mapped[float] = mapped_column(Float, nullable=False)
    accessibility_score: Mapped[float] = mapped_column(Float, nullable=False)
    charger_gap_score: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    chargers: Mapped[list["Charger"]] = relationship(back_populates="site")
