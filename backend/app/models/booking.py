from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base, utcnow


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id"), nullable=False)
    # charger_id is NOT a strict FK — it may reference either a DB charger row (DEMO)
    # or a REAL OCM charger stored only in data/chargers_bengaluru.json.
    # Using a plain index instead of FK allows both provenances without duplicate DB rows.
    charger_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    slot_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30, server_default="30")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    user: Mapped["User"] = relationship(back_populates="bookings")
    charger: Mapped["Charger"] = relationship(
        "Charger",
        primaryjoin="Booking.charger_id == Charger.id",
        foreign_keys="[Booking.charger_id]",
        uselist=False,
        viewonly=True,
    )

    @property
    def resolved_status(self) -> str:
        from datetime import datetime, timezone, timedelta
        if self.status in ("CANCELLED", "PAYMENT_PENDING", "PAYMENT_FAILED"):
            return self.status

        now = datetime.now(timezone.utc)
        slot_time = self.slot_time
        if slot_time.tzinfo is None:
            slot_time = slot_time.replace(tzinfo=timezone.utc)

        duration = getattr(self, "duration_minutes", 30) or 30
        end_time = slot_time + timedelta(minutes=duration)

        if now < slot_time:
            return "BOOKED"
        elif slot_time <= now < end_time:
            return "ACTIVE"
        else:
            return "COMPLETED"
