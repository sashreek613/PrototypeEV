"""OCPP / simulator physical status fields.

Revision ID: 0010_ocpp_physical_status
Revises: 0009_operator_network
Create Date: 2026-09-05
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010_ocpp_physical_status"
down_revision: Union[str, Sequence[str], None] = "0009_operator_network"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("chargers")}
    if "physical_status" not in cols:
        op.add_column(
            "chargers",
            sa.Column("physical_status", sa.String(length=32), nullable=False, server_default="AVAILABLE"),
        )
    if "physical_status_source" not in cols:
        op.add_column(
            "chargers",
            sa.Column("physical_status_source", sa.String(length=32), nullable=False, server_default="MANUAL"),
        )
    if "physical_status_updated_at" not in cols:
        op.add_column("chargers", sa.Column("physical_status_updated_at", sa.DateTime(timezone=True), nullable=True))
    if "ocpp_identity" not in cols:
        op.add_column("chargers", sa.Column("ocpp_identity", sa.String(length=64), nullable=True))
        op.create_index("ix_chargers_ocpp_identity", "chargers", ["ocpp_identity"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_chargers_ocpp_identity", table_name="chargers")
    op.drop_column("chargers", "ocpp_identity")
    op.drop_column("chargers", "physical_status_updated_at")
    op.drop_column("chargers", "physical_status_source")
    op.drop_column("chargers", "physical_status")
