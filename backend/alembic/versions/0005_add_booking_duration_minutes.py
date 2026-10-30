"""Add duration_minutes column to bookings.

Revision ID: 0005_add_booking_duration
Revises: 0004_vehicles_and_pricing
Create Date: 2026-08-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_add_booking_duration"
down_revision: Union[str, Sequence[str], None] = "0004_vehicles_and_pricing"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = [c["name"] for c in insp.get_columns("bookings")]

    if "duration_minutes" not in cols:
        op.add_column(
            "bookings",
            sa.Column(
                "duration_minutes",
                sa.Integer(),
                nullable=False,
                server_default="30",
            ),
        )


def downgrade() -> None:
    op.drop_column("bookings", "duration_minutes")
