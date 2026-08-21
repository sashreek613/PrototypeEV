from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base, utcnow

CHARGER_STATUS_AVAILABLE = "AVAILABLE"
CHARGER_STATUS_OFFLINE = "OFFLINE"


class Charger(Base):
    __tablename__ = "chargers"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    power_kw: Mapped[int] = mapped_column(Integer, nullable=False)
    price_per_kwh: Mapped[float] = mapped_column(Float, nullable=False)
    availability: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    connector_type: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default=CHARGER_STATUS_AVAILABLE)
    site_id: Mapped[str] = mapped_column(String(64), ForeignKey("sites.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    site: Mapped["Site"] = relationship(back_populates="chargers")
    bookings: Mapped[list["Booking"]] = relationship(back_populates="charger")
