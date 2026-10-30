"""Add vehicles table and organization/phone_number columns to users.

Revision ID: 0004_vehicles_and_pricing
Revises: 0003_user_profile_orphans
Create Date: 2026-08-22
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_vehicles_and_pricing"
down_revision: Union[str, Sequence[str], None] = "0003_user_profile_orphans"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("organization", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("phone_number", sa.String(length=50), nullable=True))

    op.create_table(
        "vehicles",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("make", sa.String(length=100), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=False),
        sa.Column("battery_capacity_kwh", sa.Float(), nullable=False),
        sa.Column("current_battery_pct", sa.Float(), nullable=False, server_default="50.0"),
        sa.Column("efficiency_wh_km", sa.Float(), nullable=False, server_default="150.0"),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_vehicles_user_id"), "vehicles", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_vehicles_user_id"), table_name="vehicles")
    op.drop_table("vehicles")
    op.drop_column("users", "phone_number")
    op.drop_column("users", "organization")
