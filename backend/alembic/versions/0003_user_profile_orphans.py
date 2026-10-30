"""Rebind UUID profile orphans on signup; clean profiles when auth users are deleted.

Revision ID: 0003_user_profile_orphans
Revises: 0002_auth_profiles
Create Date: 2026-08-21

Does not change table schema, RLS policies, or demo rows.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_user_profile_orphans"
down_revision: Union[str, Sequence[str], None] = "0002_auth_profiles"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


UPGRADE_SQL = r"""
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
    IF v_role NOT IN ('planner', 'driver') THEN
      v_role := 'driver';
    END IF;
    v_name := coalesce(
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'name', ''),
      split_part(coalesce(NEW.email, 'user'), '@', 1)
    );
    v_email := coalesce(NEW.email, '');

    -- Previous failed signups can leave a UUID profile with this email and no
    -- matching auth.users row. UNIQUE(email) then aborts auth.users insert.
    -- Only UUID-shaped ids are removed so demo rows (user-*-demo) stay.
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

  CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $fn$
  BEGIN
    DELETE FROM public.users
    WHERE id = OLD.id::text
      AND id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    RETURN OLD;
  END;
  $fn$;

  DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
  CREATE TRIGGER on_auth_user_deleted
    AFTER DELETE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_auth_user_deleted();
END
$$;
"""


def upgrade() -> None:
    op.execute(sa.text(UPGRADE_SQL))


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DO $$
            BEGIN
              IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
                DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
              END IF;
            END
            $$;
            """
        )
    )
    op.execute("DROP FUNCTION IF EXISTS public.handle_auth_user_deleted()")
