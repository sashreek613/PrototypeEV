# VidyutOne

EV mobility intelligence platform. This repository is the **technical foundation** for a hackathon MVP. The UI will be implemented later from screenshots — this codebase does not invent a visual design.

VidyutOne has two user experiences on one backend:

1. **Planner / DISCOM web dashboard** — candidate charging sites, stations, demand/grid indicators, and a site recommendation (`BUILD`, `BUILD_IF_MANAGED`, `DONT_BUILD`).
2. **Driver PWA** — nearby chargers, charger details, and booking a charging slot.

Coordinates and scores in `data/` look like Bengaluru but are **demo/simulated**. They are not live infrastructure, demand, or grid measurements.

## Current MVP scope

Included now:

- Project structure for frontend, backend, demo data, and docs
- FastAPI endpoints for health, sites, chargers, and bookings
- Demo dataset (10 candidate sites, 14 chargers) seeded into PostgreSQL
- Isolated site recommendation engine (weighted score + rule-based recommendation)
- Persistent bookings in PostgreSQL (not in-memory)
- React Planner + driver PWA using Axios (`VITE_API_BASE_URL`)
- SQLAlchemy + Alembic against Supabase PostgreSQL or local Docker Postgres
- CORS for local frontend development
- Docker Compose for optional local PostGIS Postgres

Intentionally not included yet:

- Real authentication (demo login remains mocked)
- PostGIS radius queries (extension can be enabled; V1 uses lat/lon)
- ML, optimization, grid modelling, dynamic pricing, route optimization
- Payments
- Simulation
- Production hardening

## Architecture

```
React Planner (and later Flutter Driver)
        |
        |  HTTP / VITE_API_BASE_URL
        v
FastAPI (/api/...)
        |
        +-- SQLAlchemy services
        +-- engines/recommendation.py
        v
PostgreSQL (Supabase, or local Docker)
```

See [docs/architecture.md](docs/architecture.md) and [docs/supabase.md](docs/supabase.md).

## Folder structure

```
VidyutOne/
├── frontend/                 React + Vite + TypeScript + Tailwind
│   ├── src/
│   │   ├── components/       Reusable, unstyled building blocks
│   │   ├── layouts/          Planner and driver shells (easy to restyle)
│   │   ├── pages/
│   │   │   ├── auth/
│   │   │   ├── planner/
│   │   │   └── driver/
│   │   ├── services/         Axios API client
│   │   ├── hooks/
│   │   ├── types/
│   │   ├── utils/
│   │   ├── data/
│   │   └── assets/
│   └── .env.example
├── backend/
│   ├── app/
│   │   ├── api/routes/       FastAPI routers
│   │   ├── core/             Settings / env
│   │   ├── database/         SQLAlchemy engine + session
│   │   ├── models/           ORM (PostgreSQL-ready)
│   │   ├── schemas/          Pydantic models
│   │   ├── services/         Business logic (mock-backed)
│   │   ├── engines/          Recommendation placeholder
│   │   └── main.py
│   ├── requirements.txt
│   └── .env.example
├── data/                     Simulated demo JSON
├── docs/
├── docker-compose.yml
└── README.md
```

## Install frontend

```bash
cd frontend
copy .env.example .env
npm install
```

On macOS/Linux use `cp .env.example .env`.

## Install backend

Python 3.12+ recommended.

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

On macOS/Linux:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

PostgreSQL **is** required for the API (Supabase or local Docker). JSON in `data/` is only used by the seed script.

After backend install, from `backend/`:

```bash
alembic upgrade head
python -m app.scripts.seed_demo
```

## Run both locally

Terminal 1 — backend (http://127.0.0.1:8001):

Port 8000 is often blocked or reserved on Windows (`WinError 10013`). Local development uses **8001**.

```bash
cd backend
.venv\Scripts\activate
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

Terminal 2 — frontend (http://localhost:5173):

```bash
cd frontend
npm run dev
```

Open http://localhost:5173 — the home page calls `GET /api/health`.

Optional Docker (Postgres + both apps):

```bash
docker compose up --build
```

## Available API endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/health` | Liveness |
| GET | `/api/sites` | Candidate sites + computed recommendation |
| GET | `/api/sites/{site_id}` | Single site |
| GET | `/api/chargers` | Demo chargers |
| GET | `/api/chargers/{charger_id}` | Single charger |
| POST | `/api/bookings` | Create booking (`BOOKED`) |
| GET | `/api/bookings/{booking_id}` | Fetch booking |

Interactive docs: http://127.0.0.1:8001/docs

Example booking body:

```json
{
  "user_id": "user-driver-demo",
  "charger_id": "chg-koramangala-01",
  "slot_time": "2026-08-20T10:30:00+00:00",
  "price": 18.5
}
```

### Recommendation engine (MVP)

`site_score` =

- 40% `demand_score`
- 35% `grid_capacity_score`
- 15% `accessibility_score`
- 10% `charger_gap_score`

Recommendation:

- `BUILD` if demand ≥ 70 and grid ≥ 70
- `BUILD_IF_MANAGED` if demand ≥ 70 and grid ≥ 40
- `DONT_BUILD` otherwise

Logic lives only in `backend/app/engines/` so it can be replaced with ML later.

## Current limitations

- Demo login is still mocked (no password check)
- Sites/chargers start as seeded demo rows (Bengaluru-looking, not live grid)
- `data/*.json` is seed input only; the API reads PostgreSQL
- No auth, payments, notifications, or real-time availability
- PostGIS radius queries are not implemented yet
- Demo coordinates must not be treated as operational data

## Planned future features

- Screenshot-accurate planner dashboard and driver PWA
- PostgreSQL persistence + PostGIS
- Authentication and role-based access (planner vs driver)
- ML / optimization for siting
- Grid modelling and dynamic pricing
- Route optimization
- Payments
- Simulation and richer demand/grid indicators
