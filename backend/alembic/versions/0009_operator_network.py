"""Operator role, nullable charger site_id, operator-owned chargers.

Revision ID: 0009_operator_network
Revises: 0008_drop_bookings_charger_fk
Create Date: 2026-09-05
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_operator_network"
down_revision: Union[str, Sequence[str], None] = "0008_drop_bookings_charger_fk"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


HANDLE_NEW_USER_SQL = r"""
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $fn$
  DECLARE
    v_role text;
    v_name text;
    v_email text;
  BEGIN
    v_role := lower(coalesce(NEW.raw_user_meta_data->>'role', ''));
    IF v_role NOT IN ('planner', 'driver', 'operator') THEN
      v_role := 'driver';
    END IF;
    v_name := coalesce(
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'name', ''),
      split_part(coalesce(NEW.email, 'user'), '@', 1)
    );
    v_email := coalesce(NEW.email, '');

    DELETE FROM public.users
    WHERE lower(email) = lower(v_email)
      AND id IS DISTINCT FROM NEW.id::text
      AND id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    INSERT INTO public.users (id, full_name, email, role, created_at)
    VALUES (NEW.id::text, v_name, v_email, v_role, now())
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
  END;
  $fn$;

  DROP POLICY IF EXISTS users_insert_own ON public.users;
  CREATE POLICY users_insert_own ON public.users
    FOR INSERT
    TO authenticated
    WITH CHECK (
      id = auth.uid()::text
      AND role IN ('planner', 'driver', 'operator')
    );

  DROP POLICY IF EXISTS users_update_own ON public.users;
  CREATE POLICY users_update_own ON public.users
    FOR UPDATE
    TO authenticated
    USING (id = auth.uid()::text)
    WITH CHECK (
      id = auth.uid()::text
      AND role IN ('planner', 'driver', 'admin', 'operator')
    );
END
$$;
"""


def upgrade() -> None:
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_role")
    op.execute(
        "ALTER TABLE users ADD CONSTRAINT ck_users_role "
        "CHECK (role IN ('planner', 'driver', 'admin', 'operator'))"
    )

    conn = op.get_bind()
    insp = sa.inspect(conn)
    charger_cols = [c["name"] for c in insp.get_columns("chargers")]
    if "operator_id" not in charger_cols:
        op.add_column("chargers", sa.Column("operator_id", sa.String(length=64), nullable=True))
        op.create_index("ix_chargers_operator_id", "chargers", ["operator_id"])
        op.create_foreign_key(
            "chargers_operator_id_fkey",
            "chargers",
            "users",
            ["operator_id"],
            ["id"],
        )

    op.alter_column("chargers", "site_id", existing_type=sa.String(length=64), nullable=True)
    op.execute(sa.text(HANDLE_NEW_USER_SQL))


def downgrade() -> None:
    op.drop_constraint("chargers_operator_id_fkey", "chargers", type_="foreignkey")
    op.drop_index("ix_chargers_operator_id", table_name="chargers")
    op.drop_column("chargers", "operator_id")
    op.alter_column("chargers", "site_id", existing_type=sa.String(length=64), nullable=False)
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_role")
    op.execute(
        "ALTER TABLE users ADD CONSTRAINT ck_users_role "
        "CHECK (role IN ('planner', 'driver', 'admin'))"
    )
