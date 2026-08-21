# VidyutOne architecture (V1)

React Planner (and later Flutter Driver) both call **one FastAPI API**.
FastAPI persists to **PostgreSQL** (Supabase in hosted use, or Docker locally).

## Request flow

1. Page or hook calls `frontend/src/services/api.ts`
2. Axios sends the request to `VITE_API_BASE_URL`
3. FastAPI route uses `Depends(get_db)`
4. Services read/write SQLAlchemy models
5. Site recommendations are computed in `backend/app/engines/recommendation.py`
6. `data/*.json` is used only by `python -m app.scripts.seed_demo`

## Database

See [supabase.md](supabase.md) for hosted setup. Docker Compose Postgres remains
available for local development with the same schema.
