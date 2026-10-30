from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base, utcnow

CHARGER_STATUS_AVAILABLE = "AVAILABLE"
CHARGER_STATUS_OFFLINE = "OFFLINE"
CHARGER_STATUS_MAINTENANCE = "MAINTENANCE"


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
    site_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("sites.id"), nullable=True)
    operator_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("users.id"), nullable=True, index=True)
    physical_status: Mapped[str] = mapped_column(String(32), nullable=False, default="AVAILABLE")
    physical_status_source: Mapped[str] = mapped_column(String(32), nullable=False, default="MANUAL")
    physical_status_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ocpp_identity: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    site: Mapped["Site | None"] = relationship(back_populates="chargers")
    bookings: Mapped[list["Booking"]] = relationship(
        "Booking",
        primaryjoin="Charger.id == Booking.charger_id",
        foreign_keys="[Booking.charger_id]",
        viewonly=True,
    )

