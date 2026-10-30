# VidyutOne architecture (V1)

React Planner and Driver both call **one FastAPI API**.
Authentication is **Supabase Auth**. FastAPI persists to **PostgreSQL**
(Supabase in hosted use, or Docker locally).

## Request flow

1. Page or hook calls `frontend/src/services/api.ts`
2. Axios attaches `Authorization: Bearer <access_token>` from the Supabase session
3. FastAPI verifies the JWT (JWKS, with optional HS256 fallback)
4. Protected routes use `Depends(get_current_user)`, `require_planner`, or `require_driver`
5. Services read/write SQLAlchemy models. Booking `user_id` is taken from the token, not the body.
6. Site recommendations are computed in `backend/app/engines/recommendation.py`
7. `data/*.json` is used only by `python -m app.scripts.seed_demo`

## Auth flow

1. Signup stores `full_name` and `role` in Supabase user metadata and sends a confirmation email
2. `/auth/callback` completes the verification or password-recovery link
3. `public.users` holds the application profile; that stored role is authoritative
4. Planner and Driver dashboards are wrapped in `RoleProtectedRoute`

See [supabase.md](supabase.md) for hosted setup. Docker Compose Postgres remains
available for local development with the same application schema.
