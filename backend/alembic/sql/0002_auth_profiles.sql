-- Optional paste for the Supabase SQL editor if you prefer not to run Alembic
-- against the cloud database. Alembic remains the preferred migration tool.
-- Requires 0001_initial_v1 to already be applied.

ALTER TABLE public.users RENAME COLUMN name TO full_name;
ALTER TABLE public.users DROP COLUMN IF EXISTS password_hash;
UPDATE public.users SET role = 'planner' WHERE lower(role) = 'planner';
UPDATE public.users SET role = 'driver' WHERE lower(role) = 'driver';
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS ck_users_role;
ALTER TABLE public.users ADD CONSTRAINT ck_users_role CHECK (role IN ('planner', 'driver'));

-- Trigger + RLS only when this is a Supabase database (auth schema exists).
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
    FOR SELECT TO authenticated
    USING (id = auth.uid()::text);

  DROP POLICY IF EXISTS users_insert_own ON public.users;
  CREATE POLICY users_insert_own ON public.users
    FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid()::text AND role IN ('planner', 'driver'));

  DROP POLICY IF EXISTS users_update_own ON public.users;
  CREATE POLICY users_update_own ON public.users
    FOR UPDATE TO authenticated
    USING (id = auth.uid()::text)
    WITH CHECK (id = auth.uid()::text AND role IN ('planner', 'driver'));

  CREATE OR REPLACE FUNCTION public.prevent_users_role_change()
  RETURNS trigger LANGUAGE plpgsql AS $fn$
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
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
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

UPDATE alembic_version SET version_num = '0002_auth_profiles'
WHERE version_num = '0001_initial_v1';
INSERT INTO alembic_version (version_num)
SELECT '0002_auth_profiles'
WHERE NOT EXISTS (SELECT 1 FROM alembic_version);
