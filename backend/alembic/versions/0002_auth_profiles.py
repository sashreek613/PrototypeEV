"""Adapt public.users into the application profile table for Supabase Auth.

Revision ID: 0002_auth_profiles
Revises: 0001_initial_v1
Create Date: 2026-08-21

Safe / additive:
- Renames users.name -> full_name
- Drops unused password_hash (passwords live only in Supabase Auth)
- Normalizes role values to planner | driver
- Does not drop the users table or existing demo rows
- Does not rewrite bookings

When the database is Supabase (auth schema present):
- Optional FK-style trigger copies new auth.users into public.users
- RLS so a logged-in user can read/update only their own profile
When the database is local Docker Postgres (no auth schema):
- Column/constraint changes still apply
- Trigger and RLS are skipped; FastAPI upserts profiles on first /api/me
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_auth_profiles"
down_revision: Union[str, Sequence[str], None] = "0001_initial_v1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SUPABASE_AUTH_SQL = """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    RAISE NOTICE 'auth schema not present; skipping RLS and signup trigger';
    RETURN;
  END IF;

  ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

  REVOKE ALL ON TABLE public.users FROM PUBLIC;
  REVOKE ALL ON TABLE public.users FROM anon;
  GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO authenticated;

  DROP POLICY IF EXISTS users_select_own ON public.users;
  CREATE POLICY users_select_own ON public.users
    FOR SELECT
    TO authenticated
    USING (id = auth.uid()::text);

  DROP POLICY IF EXISTS users_insert_own ON public.users;
  CREATE POLICY users_insert_own ON public.users
    FOR INSERT
    TO authenticated
    WITH CHECK (
      id = auth.uid()::text
      AND role IN ('planner', 'driver')
    );

  DROP POLICY IF EXISTS users_update_own ON public.users;
  CREATE POLICY users_update_own ON public.users
    FOR UPDATE
    TO authenticated
    USING (id = auth.uid()::text)
    WITH CHECK (
      id = auth.uid()::text
      AND role IN ('planner', 'driver')
    );

  CREATE OR REPLACE FUNCTION public.prevent_users_role_change()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role
       AND current_setting('request.jwt.claim.sub', true) IS NOT NULL THEN
      RAISE EXCEPTION 'role cannot be changed';
    END IF;
    RETURN NEW;
  END;
  $fn$;

  DROP TRIGGER IF EXISTS users_prevent_role_change ON public.users;
  CREATE TRIGGER users_prevent_role_change
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_users_role_change();

  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $fn$
  DECLARE
    v_role text;
    v_name text;
  BEGIN
    v_role := lower(coalesce(NEW.raw_user_meta_data->>'role', ''));
    IF v_role NOT IN ('planner', 'driver') THEN
      v_role := 'driver';
    END IF;
    v_name := coalesce(
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'name', ''),
      split_part(coalesce(NEW.email, 'user'), '@', 1)
    );

    INSERT INTO public.users (id, full_name, email, role, created_at)
    VALUES (NEW.id::text, v_name, coalesce(NEW.email, ''), v_role, now())
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
  END;
  $fn$;

  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
END
$$;
"""


def upgrade() -> None:
    op.alter_column("users", "name", new_column_name="full_name")
    op.drop_column("users", "password_hash")
    op.execute("UPDATE users SET role = 'planner' WHERE lower(role) = 'planner'")
    op.execute("UPDATE users SET role = 'driver' WHERE lower(role) = 'driver'")
    op.create_check_constraint(
        "ck_users_role",
        "users",
        "role IN ('planner', 'driver')",
    )
    op.execute(sa.text(SUPABASE_AUTH_SQL))


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DO $$
            BEGIN
              IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
                DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
              END IF;
            END
            $$;
            """
        )
    )
    op.execute("DROP TRIGGER IF EXISTS users_prevent_role_change ON public.users")
    op.execute("DROP FUNCTION IF EXISTS public.handle_new_user()")
    op.execute("DROP FUNCTION IF EXISTS public.prevent_users_role_change()")
    op.drop_constraint("ck_users_role", "users", type_="check")
    op.add_column("users", sa.Column("password_hash", sa.String(length=255), nullable=True))
    op.alter_column("users", "full_name", new_column_name="name")
    op.execute("UPDATE users SET role = 'PLANNER' WHERE role = 'planner'")
    op.execute("UPDATE users SET role = 'DRIVER' WHERE role = 'driver'")
