from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base, utcnow

ROLE_PLANNER = "planner"
ROLE_DRIVER = "driver"
ROLE_ADMIN = "admin"
ROLE_OPERATOR = "operator"
VALID_ROLES = frozenset({ROLE_PLANNER, ROLE_DRIVER, ROLE_ADMIN, ROLE_OPERATOR})


class User(Base):
    """Application profile. Authentication itself is handled by Supabase Auth.

    `id` matches `auth.users.id` (UUID string) for registered accounts.
    Demo seed rows keep their original string ids and are not login accounts.
    """

    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('planner', 'driver', 'admin', 'operator')", name="ck_users_role"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    organization: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    designation: Mapped[str | None] = mapped_column(String(100), nullable=True)

    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    verification_status: Mapped[str] = mapped_column(String(32), nullable=False, default="approved")
    rejection_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    bookings: Mapped[list["Booking"]] = relationship(back_populates="user")
    vehicles: Mapped[list["Vehicle"]] = relationship(back_populates="user", cascade="all, delete-orphan")


