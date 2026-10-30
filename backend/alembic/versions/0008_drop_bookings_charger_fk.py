"""Allow bookings for OpenChargeMap chargers that have no chargers row.

The SQLAlchemy Booking model already treats charger_id as a plain indexed
string (demo DB chargers or REAL OCM ids). Postgres still had the original
bookings_charger_id_fkey, so Pay on a live OCM hub failed the INSERT.

Revision ID: 0008_drop_bookings_charger_fk
Revises: 0007_vehicle_reg_date
Create Date: 2026-09-05
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0008_drop_bookings_charger_fk"
down_revision: Union[str, Sequence[str], None] = "0007_vehicle_reg_date"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("bookings_charger_id_fkey", "bookings", type_="foreignkey")


def downgrade() -> None:
    op.create_foreign_key(
        "bookings_charger_id_fkey",
        "bookings",
        "chargers",
        ["charger_id"],
        ["id"],
    )
