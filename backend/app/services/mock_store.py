import json
from pathlib import Path
from typing import Any

from app.core.config import get_settings


def _load_json(filename: str) -> list[dict[str, Any]]:
    data_dir: Path = get_settings().DATA_DIR
    path = data_dir / filename
    with path.open(encoding="utf-8") as file:
        payload = json.load(file)
    if not isinstance(payload, list):
        raise ValueError(f"Expected a list in {path}")
    return payload


def load_sites() -> list[dict[str, Any]]:
    return _load_json("sites.json")


def load_chargers() -> list[dict[str, Any]]:
    return _load_json("chargers.json")


# -- Real Bengaluru data, written by app/scripts/fetch_bengaluru_data.py --
# These loaders return [] / None (never raise) when the fetch script hasn't
# produced a file yet, so callers (site_service.py's scoring adapter) can
# degrade gracefully instead of crashing every request.


def load_real_chargers() -> list[dict[str, Any]] | None:
    """OpenChargeMap chargers. None (not []) means "not fetched yet" --
    callers use this to distinguish "no real data available" from "real
    data available, zero results"."""
    path = get_settings().DATA_DIR / "chargers_bengaluru.json"
    if not path.exists():
        return None
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def load_candidate_sites() -> list[dict[str, Any]]:
    path = get_settings().DATA_DIR / "candidate_sites_bengaluru.json"
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def load_substations() -> list[dict[str, Any]]:
    path = get_settings().DATA_DIR / "substations_bengaluru.json"
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def load_ev_registrations() -> list[dict[str, Any]]:
    path = get_settings().DATA_DIR / "ev_registrations_bengaluru.json"
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def load_localities() -> list[dict[str, Any]]:
    path = get_settings().DATA_DIR / "localities_bengaluru.json"
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as file:
        return json.load(file)
