# Supabase + FastAPI (V1)

FastAPI remains the application API. Supabase PostgreSQL is the database.

Do **not** put the database password or service-role key in the React app.

## Dashboard steps (manual)

1. Create a Supabase project.
2. Database → Extensions → enable **postgis** (or run `CREATE EXTENSION IF NOT EXISTS postgis;` in the SQL editor).
3. Project Settings → Database → copy the connection string.
   - Prefer the **session pooler (port 5432)** for Alembic migrations.
   - Prefer the **transaction pooler (port 6543)** for the running API if you hit connection limits.
4. Convert the scheme to SQLAlchemy + psycopg:
   `postgresql://...` → `postgresql+psycopg://...`
5. Put it in `backend/.env` as `DATABASE_URL=...` (file is gitignored).
6. From `backend/`:
   ```bash
   alembic upgrade head
   python -m app.scripts.seed_demo
   ```

Alembic creates `users`, `sites`, `chargers`, `bookings`. The seed script copies the 10 demo sites and 14 demo chargers and inserts:

- `user-driver-demo` (DRIVER) — required by the current booking UI
- `user-planner-demo` (PLANNER) — reserved for later auth

## What this project does **not** use yet

`SUPABASE_URL` / `SUPABASE_ANON_KEY` / service-role keys are **not** required for V1. FastAPI uses `DATABASE_URL` only.
