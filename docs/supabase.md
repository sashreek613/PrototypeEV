# Supabase + FastAPI (V1)

FastAPI remains the application API. Supabase Auth authenticates users. PostgreSQL
(Supabase or local Docker) stores application data.

Do **not** put the database password or service-role key in the React app.
Frontend env files may only contain the project URL and the publishable/anon key.

## Dashboard steps (manual)

### Database

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

Alembic creates `users`, `sites`, `chargers`, `bookings` and then adapts `users`
into the application profile table (`full_name`, role `planner`/`driver`, no password hash).

The seed script still inserts demo profile rows (`user-driver-demo`, `user-planner-demo`).
Those rows are sample data only — they are **not** login accounts.

### Authentication (required)

7. Project Settings → API: copy **Project URL** and the **publishable** key (or legacy anon key).
8. Put those in `frontend/.env`:
   ```
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=...
   VITE_SITE_URL=http://localhost:5173
   ```
9. Put the same project URL in `backend/.env`:
   ```
   SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   SUPABASE_JWT_ISSUER=https://YOUR_PROJECT_REF.supabase.co/auth/v1
   SUPABASE_JWKS_URL=https://YOUR_PROJECT_REF.supabase.co/auth/v1/.well-known/jwks.json
   ```
   FastAPI verifies access tokens with JWKS (ES256/RS256). Add `SUPABASE_JWT_SECRET`
   only if your project still issues legacy HS256 tokens.

10. Authentication → Providers → **Email** → enable Email provider.
11. Authentication → Providers → Email → **Confirm email**: ON.
12. Authentication → URL Configuration:
    - **Site URL:** `http://localhost:5173`
    - **Redirect URLs:** add
      - `http://localhost:5173/**`
      - `http://localhost:5173/auth/callback`
      - `http://localhost:5173/reset-password`
      - `http://127.0.0.1:5173/**`
      - `http://127.0.0.1:5173/auth/callback`
      - `http://127.0.0.1:5173/reset-password`
13. Authentication → Email Templates → **Confirm signup**.
    Custom SMTP is configured, so the Source is editable. Replace the confirmation
    link so it uses `token_hash` instead of only `{{ .ConfirmationURL }}`. That lets
    the user open the email in another browser or Chrome profile. Use this body:

    ```html
    <h2>Confirm your email</h2>
    <p>Follow this link to confirm your email for VidyutOne:</p>
    <p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email">Confirm your email</a></p>
    ```

    Do not hardcode localhost or project URLs. `{{ .SiteURL }}` comes from
    Authentication → URL Configuration → Site URL.
    Leave **Confirm email** ON. Do not switch the app away from PKCE.
    Previously sent emails still use the old `ConfirmationURL` link; resend after
    saving the template.

14. Authentication → SMTP Settings (or Project Settings → Authentication → SMTP):
    Enable **Custom SMTP** and save Resend:

    - **Host:** `smtp.resend.com`
    - **Port:** `465`
    - **Username:** `resend`
    - **Password:** your Resend API key (dashboard only; never put it in frontend `.env`)
    - **Sender email:** an address on a verified Resend domain
    - **Sender name:** `VidyutOne`

    Click **Save**. Built-in Supabase mail is rate-limited; a failed custom SMTP
    send returns "Error sending confirmation email".

## How profiles work

`public.users` is the application profile table (not a second `profiles` table):

- `id` — matches `auth.users.id` for registered accounts
- `full_name`
- `email`
- `role` — `planner` or `driver` only
- `created_at`

Passwords are stored only by Supabase Auth. The old `password_hash` column is removed.

On Supabase-hosted Postgres, a trigger copies new `auth.users` rows into `public.users`
and RLS limits a user to their own profile. FastAPI also upserts the profile on first
authenticated `/api/me` so local Docker Postgres still works.
