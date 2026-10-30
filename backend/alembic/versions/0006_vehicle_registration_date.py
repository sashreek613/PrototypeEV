"""Add registration_date to vehicles, for battery-health-by-age estimation.

Nullable: existing vehicles have no registration date on file. A NULL here
means "vehicle age unknown" -- the battery-health factor in range_service.py
treats that as a documented no-op (multiplier 1.0), same pattern as the
temperature/climate-control/driving-profile factors when their inputs are
missing.

Revision ID: 0007_vehicle_reg_date
Revises: 0006_planner_admin
Create Date: 2026-08-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_vehicle_reg_date"
down_revision: Union[str, Sequence[str], None] = "0006_planner_admin"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = [c["name"] for c in insp.get_columns("vehicles")]

    if "registration_date" not in cols:
        op.add_column("vehicles", sa.Column("registration_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("vehicles", "registration_date")
