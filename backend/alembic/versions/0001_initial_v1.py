"""Initial V1 schema: users, sites, chargers, bookings.

Revision ID: 0001_initial_v1
Revises:
Create Date: 2026-08-20

PostGIS is not created here. Enable it in the Supabase dashboard (Extensions)
or SQL editor so later geographic queries can use it. V1 keeps lat/lon floats.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial_v1"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )

    op.create_table(
        "sites",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("demand_score", sa.Float(), nullable=False),
        sa.Column("grid_capacity_score", sa.Float(), nullable=False),
        sa.Column("accessibility_score", sa.Float(), nullable=False),
        sa.Column("charger_gap_score", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "chargers",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("power_kw", sa.Integer(), nullable=False),
        sa.Column("price_per_kwh", sa.Float(), nullable=False),
        sa.Column("availability", sa.Boolean(), nullable=False),
        sa.Column("connector_type", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("site_id", sa.String(length=64), sa.ForeignKey("sites.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_chargers_site_id", "chargers", ["site_id"])

    op.create_table(
        "bookings",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("charger_id", sa.String(length=64), sa.ForeignKey("chargers.id"), nullable=False),
        sa.Column("slot_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("price", sa.Float(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_bookings_user_id", "bookings", ["user_id"])
    op.create_index("ix_bookings_charger_id", "bookings", ["charger_id"])


def downgrade() -> None:
    op.drop_index("ix_bookings_charger_id", table_name="bookings")
    op.drop_index("ix_bookings_user_id", table_name="bookings")
    op.drop_table("bookings")
    op.drop_index("ix_chargers_site_id", table_name="chargers")
    op.drop_table("chargers")
    op.drop_table("sites")
    op.drop_table("users")
