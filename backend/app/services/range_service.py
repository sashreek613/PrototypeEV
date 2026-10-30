"""Range estimation service -- the ONLY place range math happens.

Calculates available energy (kWh) and estimated usable range (km) from
vehicle battery capacity, current battery percentage, and Wh/km efficiency,
then applies four OPTIONAL, documented multiplier adjustments (temperature,
climate control, driving profile, battery health by age) -- a transparent
multiplier chain, not an ML model, in the same spirit as
app/engines/site_scoring.py's weighted, explainable math on the planner
side. Every adjustment is recorded in `factors` on the returned
RangeEstimate so the UI can show its work, same pattern as ScoredFactorRead
there.

frontend/src/components/driver/VehicleWidget.tsx calls GET /vehicles/{id}/range
(which calls calculate_range() below) rather than recomputing this formula
itself -- see that file's drag-preview comment for the one narrow, documented
exception (instant client-side feedback while dragging the battery slider,
never used for the actual reachable-chargers filter).
"""

from __future__ import annotations

import time
from datetime import date

import httpx

from app.schemas.vehicle import RangeEstimate, RangeFactor
from app.services.battery_health_service import estimate_battery_health

# Real EVs shouldn't be planned down to 0% battery. This is a documented
# planning margin -- not a measured vehicle limit -- subtracted from the
# battery percentage before computing the range the app actually uses for
# "can I reach this charger" decisions (buffered_range_km below).
RESERVE_BATTERY_PCT = 10.0

# ---------------------------------------------------------------------------
# Temperature -- Open-Meteo (free, no key; matches the project's own
# documented stack -- see docs/architecture.md's tile/geocoding choices for
# the same "free, keyless" preference elsewhere).
# ---------------------------------------------------------------------------

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_TIMEOUT_S = 5.0

# Real-world EV cold-weather range loss is well documented: AAA's 2019 cold-
# weather EV test found up to ~41% range loss at -6.7C with cabin heating
# running; Recurrent's 2023 fleet study found roughly 20-30% loss in
# freezing temperatures. Heat is a smaller, but real, effect via AC and
# battery thermal-management load. These bands are a conservative,
# documented approximation -- not a manufacturer-specific curve -- and are
# ONLY the ambient-temperature effect; climate-control's own HVAC load is a
# separate factor below so the two aren't double-counted.
COMFORTABLE_TEMP_MIN_C = 15.0
COMFORTABLE_TEMP_MAX_C = 35.0


def _temperature_multiplier(temp_c: float) -> tuple[float, str]:
    if temp_c < 0.0:
        return 0.70, f"{temp_c:.1f}°C outside (below freezing) -- significant cold-weather range loss"
    if temp_c < COMFORTABLE_TEMP_MIN_C:
        return 0.85, f"{temp_c:.1f}°C outside (cool) -- moderate cold-weather range loss"
    if temp_c <= COMFORTABLE_TEMP_MAX_C:
        return 1.0, f"{temp_c:.1f}°C outside -- within the comfortable band, no adjustment"
    if temp_c <= 45.0:
        return 0.90, f"{temp_c:.1f}°C outside (hot) -- AC/thermal-management load"
    return 0.85, f"{temp_c:.1f}°C outside (extreme heat) -- heavy AC/thermal-management load"


# Tiny in-process cache, NOT the "cache client-side" requirement (that's
# frontend/src/components/driver/VehicleWidget.tsx's job, for showing the
# live reading without refetching on every render) -- this is a server-side
# guard so many range requests from roughly the same place in a short
# window don't each hit Open-Meteo. Keyed to ~1.1km precision.
_TEMPERATURE_CACHE: dict[tuple[float, float], tuple[float, float]] = {}
TEMPERATURE_CACHE_TTL_S = 300.0


def _fetch_temperature_c(latitude: float, longitude: float) -> float | None:
    """None on ANY failure (timeout, bad response, Open-Meteo down) -- a
    weather API hiccup must never break range calculation, it just means no
    temperature adjustment gets applied this time."""
    key = (round(latitude, 2), round(longitude, 2))
    now = time.monotonic()
    cached = _TEMPERATURE_CACHE.get(key)
    if cached is not None and now - cached[1] < TEMPERATURE_CACHE_TTL_S:
        return cached[0]
    try:
        resp = httpx.get(
            OPEN_METEO_URL,
            params={"latitude": latitude, "longitude": longitude, "current": "temperature_2m"},
            timeout=OPEN_METEO_TIMEOUT_S,
        )
        resp.raise_for_status()
        temp_c = float(resp.json()["current"]["temperature_2m"])
    except Exception:  # noqa: BLE001 -- any failure here degrades to "no adjustment", never a 500
        return None
    _TEMPERATURE_CACHE[key] = (temp_c, now)
    return temp_c


# ---------------------------------------------------------------------------
# Climate control -- fixed, documented HVAC-load penalty. Widely cited
# rule-of-thumb across EV range calculators/owner communities: running
# cabin heating or AC costs roughly 10-15% of range depending on conditions;
# 10% is used here as the conservative end.
# ---------------------------------------------------------------------------

CLIMATE_CONTROL_MULTIPLIER = 0.90

# ---------------------------------------------------------------------------
# Driving profile -- "mixed" is 1.0, i.e. today's existing behaviour is the
# default and nothing regresses for a caller that never sets this. City
# driving benefits from regenerative braking in stop-go traffic; highway
# speeds cost meaningfully more range to aerodynamic drag, which scales
# with the square of speed -- both are standard, widely-cited EV efficiency
# effects, approximated here as flat multipliers rather than a speed curve.
# ---------------------------------------------------------------------------

DRIVING_PROFILE_MULTIPLIERS: dict[str, float] = {
    "city": 1.05,
    "mixed": 1.0,
    "highway": 0.85,
}


def calculate_range(
    battery_capacity_kwh: float,
    current_battery_pct: float,
    efficiency_wh_km: float = 150.0,
    *,
    latitude: float | None = None,
    longitude: float | None = None,
    climate_control: bool = False,
    driving_profile: str = "mixed",
    registration_date: date | None = None,
) -> RangeEstimate:
    """latitude/longitude/climate_control/driving_profile/registration_date
    are all optional and default to values that apply NO adjustment
    (multiplier 1.0 across the board) -- an old caller that never passes
    them gets exactly today's numbers, unchanged."""
    pct = max(0.0, min(100.0, current_battery_pct))
    available_kwh = round((battery_capacity_kwh * pct) / 100.0, 2)
    # Wh/km -> kWh/km = efficiency_wh_km / 1000.0
    kwh_per_km = efficiency_wh_km / 1000.0 if efficiency_wh_km > 0 else 0.15
    base_estimated_range_km = available_kwh / kwh_per_km

    buffered_pct = max(0.0, pct - RESERVE_BATTERY_PCT)
    buffered_kwh = round((battery_capacity_kwh * buffered_pct) / 100.0, 2)
    base_buffered_range_km = buffered_kwh / kwh_per_km

    factors: list[RangeFactor] = []
    combined_multiplier = 1.0

    temp_c = _fetch_temperature_c(latitude, longitude) if latitude is not None and longitude is not None else None
    if temp_c is None:
        temp_multiplier, temp_detail = 1.0, "temperature not available -- no adjustment applied"
    else:
        temp_multiplier, temp_detail = _temperature_multiplier(temp_c)
    combined_multiplier *= temp_multiplier
    factors.append(RangeFactor(key="temperature", label="Temperature", multiplier=temp_multiplier, detail=temp_detail))

    if climate_control:
        combined_multiplier *= CLIMATE_CONTROL_MULTIPLIER
        factors.append(
            RangeFactor(
                key="climate_control",
                label="AC",
                multiplier=CLIMATE_CONTROL_MULTIPLIER,
                detail="AC on -- HVAC load reduces range",
            )
        )
    else:
        factors.append(
            RangeFactor(key="climate_control", label="AC", multiplier=1.0, detail="AC off -- no adjustment")
        )

    profile_multiplier = DRIVING_PROFILE_MULTIPLIERS.get(driving_profile, 1.0)
    combined_multiplier *= profile_multiplier
    factors.append(
        RangeFactor(
            key="driving_profile",
            label="Driving profile",
            multiplier=profile_multiplier,
            detail=f"{driving_profile.title()} driving profile"
            + (" (baseline)" if driving_profile == "mixed" else ""),
        )
    )

    health_multiplier, health_detail = estimate_battery_health(registration_date)
    combined_multiplier *= health_multiplier
    factors.append(
        RangeFactor(key="battery_health", label="Battery health", multiplier=health_multiplier, detail=health_detail)
    )

    estimated_range_km = round(base_estimated_range_km * combined_multiplier, 1)
    buffered_range_km = round(base_buffered_range_km * combined_multiplier, 1)

    return RangeEstimate(
        battery_capacity_kwh=battery_capacity_kwh,
        current_battery_pct=pct,
        available_kwh=available_kwh,
        efficiency_wh_km=efficiency_wh_km,
        estimated_range_km=estimated_range_km,
        buffered_range_km=buffered_range_km,
        reserve_pct=RESERVE_BATTERY_PCT,
        factors=factors,
    )
