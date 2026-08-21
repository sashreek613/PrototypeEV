"""Seed demo users, sites, and chargers. Idempotent — existing rows are left unchanged."""

from __future__ import annotations

import json
from pathlib import Path

from app.core.config import get_settings
from app.database.session import SessionLocal, utcnow
from app.models.charger import CHARGER_STATUS_AVAILABLE, CHARGER_STATUS_OFFLINE, Charger
from app.models.site import Site
from app.models.user import ROLE_DRIVER, ROLE_PLANNER, User
from app.services.mock_store import load_chargers, load_sites

DEMO_USERS = [
    {
        "id": "user-driver-demo",
        "name": "Nikhil",
        "email": "driver.demo@vidyutone.local",
        "role": ROLE_DRIVER,
    },
    {
        "id": "user-planner-demo",
        "name": "A. Rao",
        "email": "a.rao@bescom.karnataka.gov.in",
        "role": ROLE_PLANNER,
    },
]


def seed(db=None) -> dict[str, int]:
    close = False
    if db is None:
        db = SessionLocal()
        close = True

    added = {"users": 0, "sites": 0, "chargers": 0}
    now = utcnow()

    try:
        for raw in DEMO_USERS:
            if db.get(User, raw["id"]) is None:
                db.add(
                    User(
                        id=raw["id"],
                        name=raw["name"],
                        email=raw["email"],
                        password_hash=None,
                        role=raw["role"],
                        created_at=now,
                    )
                )
                added["users"] += 1

        for raw in load_sites():
            site_id = str(raw["id"])
            if db.get(Site, site_id) is None:
                db.add(
                    Site(
                        id=site_id,
                        name=str(raw["name"]),
                        latitude=float(raw["latitude"]),
                        longitude=float(raw["longitude"]),
                        demand_score=float(raw["demand_score"]),
                        grid_capacity_score=float(raw["grid_capacity_score"]),
                        accessibility_score=float(raw["accessibility_score"]),
                        charger_gap_score=float(raw["charger_gap_score"]),
                        created_at=now,
                    )
                )
                added["sites"] += 1

        for raw in load_chargers():
            charger_id = str(raw["id"])
            if db.get(Charger, charger_id) is None:
                available = bool(raw["availability"])
                db.add(
                    Charger(
                        id=charger_id,
                        name=str(raw["name"]),
                        latitude=float(raw["latitude"]),
                        longitude=float(raw["longitude"]),
                        power_kw=int(raw["power_kw"]),
                        price_per_kwh=float(raw["price_per_kwh"]),
                        availability=available,
                        connector_type=str(raw["connector_type"]),
                        status=CHARGER_STATUS_AVAILABLE if available else CHARGER_STATUS_OFFLINE,
                        site_id=str(raw["site_id"]),
                        created_at=now,
                    )
                )
                added["chargers"] += 1

        db.commit()
        return added
    except Exception:
        db.rollback()
        raise
    finally:
        if close:
            db.close()


def main() -> None:
    settings = get_settings()
    data_dir: Path = settings.DATA_DIR
    if not (data_dir / "sites.json").exists():
        raise FileNotFoundError(f"Expected demo JSON in {data_dir}")
    added = seed()
    print(json.dumps({"seeded": added, "data_dir": str(data_dir)}, indent=2))


if __name__ == "__main__":
    main()
