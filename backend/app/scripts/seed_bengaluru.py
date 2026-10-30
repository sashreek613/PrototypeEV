"""Seed real Bengaluru candidate sites (data/candidate_sites_bengaluru.json,
from Phase A's OSM/Overpass fetch) into the same `sites` table seed_demo.py
uses. Idempotent -- existing rows (by id) are left unchanged, same as
seed_demo.py. Run after `python -m app.scripts.fetch_bengaluru_data`; safe to
run alongside seed_demo.py since real and demo rows use disjoint id
namespaces ("osm-*" vs "site-*") -- both coexist rather than one replacing
the other. Delete the demo rows yourself first if you want a real-only DB.

Real chargers (data/chargers_bengaluru.json, from OpenChargeMap) are
deliberately NOT seeded into the `chargers` table here. Charger.site_id is a
mandatory FK meaning "this charger was installed for this candidate site" --
true for the demo data (each charger placed ~50-100m from its site) but
false for real chargers, which are pre-existing infrastructure with no
natural link to any one candidate site. Forcing one (e.g. "nearest candidate
site") would misrepresent that relationship, and making site_id nullable
would need a schema migration, which this task's brief rules out. Real
chargers already reach the app the correct way: site_service.py loads
data/chargers_bengaluru.json directly for scoring (see coverage_gap in
app/engines/site_scoring.py). Only /api/chargers (the driver-facing listing)
doesn't see them yet -- a real, documented gap, not an oversight.

SITE_SEED_LIMIT caps how many of the ~2000 real candidates get seeded.
Every seeded Site is rescored on every /api/sites* request (site_service.py
does no DB-side filtering), and each score does O(candidate_count) work --
at ~2000 sites that's several million haversine calls per request. 150 keeps
requests fast while still giving a real, multi-category shortlist. Selection
favours named, tag-rich OSM features (more presentable, more real signal)
over unnamed ones, spread evenly across categories rather than letting the
numerically dominant ones (parking: 1269, fuel stations: 558) crowd out
mall/bus_station/metro_station.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.database.session import SessionLocal, utcnow
from app.models.site import Site
from app.services.mock_store import load_candidate_sites

SITE_SEED_LIMIT = 150
PER_CATEGORY_CAP = 30

# site_service.py recomputes real scores from live data on every read (see
# _to_site_read) -- these four columns only need to satisfy the schema at
# insert time; the API never serves them as-is for a real-seeded site.
_PLACEHOLDER_SCORE = 50.0


def _select_candidates() -> list[dict[str, Any]]:
    candidates = load_candidate_sites()
    by_category: dict[str, list[dict[str, Any]]] = {}
    for c in candidates:
        by_category.setdefault(c["category"], []).append(c)

    selected: list[dict[str, Any]] = []
    for rows in by_category.values():
        ranked = sorted(
            rows,
            key=lambda r: (
                not r["name_is_real"],  # named candidates first
                not (r.get("capacity") or r.get("area_m2")),  # then tag-rich ones
            ),
        )
        selected.extend(ranked[:PER_CATEGORY_CAP])
    return selected[:SITE_SEED_LIMIT]


def seed(db=None) -> dict[str, int]:
    close = False
    if db is None:
        db = SessionLocal()
        close = True

    added = {"sites": 0}
    now = utcnow()

    try:
        for row in _select_candidates():
            site_id = str(row["id"])
            if db.get(Site, site_id) is None:
                db.add(
                    Site(
                        id=site_id,
                        name=str(row["name"]),
                        latitude=float(row["latitude"]),
                        longitude=float(row["longitude"]),
                        demand_score=_PLACEHOLDER_SCORE,
                        grid_capacity_score=_PLACEHOLDER_SCORE,
                        accessibility_score=_PLACEHOLDER_SCORE,
                        charger_gap_score=_PLACEHOLDER_SCORE,
                        created_at=now,
                    )
                )
                added["sites"] += 1
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
    if not (data_dir / "candidate_sites_bengaluru.json").exists():
        raise FileNotFoundError(
            f"Expected data/candidate_sites_bengaluru.json in {data_dir} -- "
            "run `python -m app.scripts.fetch_bengaluru_data` first."
        )
    added = seed()
    print(json.dumps({"seeded": added, "data_dir": str(data_dir)}, indent=2))


if __name__ == "__main__":
    main()
