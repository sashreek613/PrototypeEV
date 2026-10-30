"""Add planner verification status and admin role support.

Revision ID: 0006_planner_admin
Revises: 0005_add_booking_duration
Create Date: 2026-08-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_planner_admin"
down_revision: Union[str, Sequence[str], None] = "0005_add_booking_duration"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = [c["name"] for c in insp.get_columns("users")]

    if "designation" not in cols:
        op.add_column("users", sa.Column("designation", sa.String(length=100), nullable=True))
    if "is_verified" not in cols:
        op.add_column("users", sa.Column("is_verified", sa.Boolean(), nullable=False, server_default="true"))
    if "is_active" not in cols:
        op.add_column("users", sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"))
    if "verification_status" not in cols:
        op.add_column("users", sa.Column("verification_status", sa.String(length=32), nullable=False, server_default="approved"))
    if "rejection_reason" not in cols:
        op.add_column("users", sa.Column("rejection_reason", sa.String(length=500), nullable=True))

    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_role")
    op.execute("ALTER TABLE users ADD CONSTRAINT ck_users_role CHECK (role IN ('planner', 'driver', 'admin'))")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_role")
    op.execute("ALTER TABLE users ADD CONSTRAINT ck_users_role CHECK (role IN ('planner', 'driver'))")

    op.drop_column("users", "rejection_reason")
    op.drop_column("users", "verification_status")
    op.drop_column("users", "is_active")
    op.drop_column("users", "is_verified")
    op.drop_column("users", "designation")
