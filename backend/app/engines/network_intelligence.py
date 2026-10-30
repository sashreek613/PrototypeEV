"""Rule-based EV network intelligence.

Pure functions: bookings + charger snapshots in, scored recommendations out.
No FastAPI, no SQLAlchemy, no network. Same honesty pattern as site_scoring.py:

  REAL       occupancy/availability taken from a live charger field or an
             overlapping booking row
  DERIVED    counts, utilization, wait estimates computed from those rows
  ESTIMATED  documented proxies (urban travel speed, wait minutes per
             congestion band, peak-hour bump from pricing windows)

Weights live in ONE place (SCORE_WEIGHTS / PREFERENCE_WEIGHTS). Preference
only reshuffles those weights -- it does not invent a second scoring model.

This module never sees driver name, email, or phone. Booking rows are
charger_id + slot_time + duration + status only.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum

from app.engines.occupancy import physically_busy, physically_down
from app.engines.site_scoring import haversine_km
from app.services.pricing_service import calculate_slot_price

SCORE_WEIGHTS: dict[str, float] = {
    "availability": 0.12,
    "wait": 0.22,
    "distance": 0.18,
    "charge_time": 0.16,
    "cost": 0.16,
    "congestion": 0.16,
}
assert abs(sum(SCORE_WEIGHTS.values()) - 1.0) < 1e-9

PREFERENCE_WEIGHTS: dict[str, dict[str, float]] = {
    "balanced": dict(SCORE_WEIGHTS),
    "minimize_time": {
        "availability": 0.06,
        "wait": 0.28,
        "distance": 0.18,
        "charge_time": 0.28,
        "cost": 0.08,
        "congestion": 0.12,
    },
    "minimize_cost": {
        "availability": 0.12,
        "wait": 0.12,
        "distance": 0.12,
        "charge_time": 0.12,
        "cost": 0.40,
        "congestion": 0.12,
    },
}
for _weights in PREFERENCE_WEIGHTS.values():
    assert abs(sum(_weights.values()) - 1.0) < 1e-9

PREFERENCE_BALANCED = "balanced"
PREFERENCE_TIME = "minimize_time"
PREFERENCE_COST = "minimize_cost"
VALID_PREFERENCES = frozenset(PREFERENCE_WEIGHTS)

ESTIMATED_TRAVEL_KMH = 25.0
WAIT_SCORE_CAP_MIN = 45.0
CHARGE_SCORE_CAP_MIN = 90.0
HIGH_BOOKINGS_2H = 3
MODERATE_BOOKINGS_2H = 1
WAIT_MINUTES = {"LOW": 5.0, "MODERATE": 12.0, "HIGH": 25.0}
WAIT_PER_BOOKING_MIN = 8.0
WAIT_CAP_MIN = 45.0
GAP_CELL_DEG = 0.05
GAP_BOOKINGS_PER_CHARGER_HIGH = 3.0
GAP_KW_LOW = 50.0
COUNTED_BOOKING_STATUSES = frozenset({"BOOKED", "ACTIVE", "PAYMENT_PENDING"})
GAP_BOOKING_STATUSES = COUNTED_BOOKING_STATUSES | {"COMPLETED"}
FALLBACK_TARIFF = 18.0
FALLBACK_POWER_KW = 7.4


class CongestionLevel(str, Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"


class DemandLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class CapacityLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


@dataclass(frozen=True)
class BookingSnap:
    charger_id: str
    slot_time: datetime
    duration_minutes: int
    status: str
    price: float = 0.0


@dataclass(frozen=True)
class ChargerSnap:
    id: str
    name: str
    latitude: float
    longitude: float
    power_kw: float | None
    price_per_kwh: float | None
    availability: bool | None
    site_id: str | None
    status: str | None = None
    provenance: str = "DEMO"
    physical_status: str | None = None


@dataclass
class CongestionResult:
    charger_id: str
    level: CongestionLevel
    estimated_wait_minutes: float
    upcoming_bookings_2h: int
    occupancy_now: bool
    busy_period_label: str
    provenance: str
    detail: str


@dataclass
class ScoredCharger:
    charger: ChargerSnap
    km: float
    wait_minutes: float
    charge_minutes: float
    travel_minutes: float
    energy_kwh: float
    cost: float
    congestion: CongestionResult
    overall_score: float
    factors: dict[str, float]
    why: str
    reachable: bool
    station_utilization: float


@dataclass
class OptimizerPicks:
    fastest: ScoredCharger | None
    cheapest: ScoredCharger | None
    best_overall: ScoredCharger | None


@dataclass
class SmartTimeResult:
    slot_iso: str
    label: str
    estimated_cost: float
    current_cost: float
    savings: float
    is_off_peak: bool
    is_peak: bool
    expected_demand: CongestionLevel
    provenance: str
    detail: str


@dataclass
class CapacityGap:
    cell_id: str
    area_label: str
    latitude: float
    longitude: float
    charger_count: int
    total_kw: float
    bookings_24h: int
    peak_utilization: float
    demand: DemandLevel
    capacity: CapacityLevel
    expected_congestion: CongestionLevel
    nearest_site_id: str | None
    nearest_site_name: str | None
    site_recommendation: str | None
    action: str
    provenance: str
    detail: str


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _overlap(start_a: datetime, end_a: datetime, start_b: datetime, end_b: datetime) -> bool:
    return start_a < end_b and start_b < end_a


def _booking_window(booking: BookingSnap) -> tuple[datetime, datetime]:
    start = _aware(booking.slot_time)
    minutes = booking.duration_minutes if booking.duration_minutes > 0 else 30
    return start, start + timedelta(minutes=minutes)


def counted_bookings(bookings: list[BookingSnap]) -> list[BookingSnap]:
    return [row for row in bookings if row.status in COUNTED_BOOKING_STATUSES]


def predict_congestion(
    charger: ChargerSnap,
    bookings: list[BookingSnap],
    now: datetime,
) -> CongestionResult:
    """Rule-based congestion. Not an ML model.

    HIGH if the plug is occupied now, marked unavailable, or has 3+ overlapping
    bookings in the next 2 hours. MODERATE for 1–2 upcoming bookings or a
    peak-hour window with any upcoming booking. Otherwise LOW.
    """
    now = _aware(now)
    horizon = now + timedelta(hours=2)
    relevant = [row for row in counted_bookings(bookings) if row.charger_id == charger.id]
    occupancy_now = False
    upcoming = 0
    for row in relevant:
        start, end = _booking_window(row)
        if _overlap(start, end, now, now + timedelta(minutes=1)):
            occupancy_now = True
        if _overlap(start, end, now, horizon):
            upcoming += 1

    # Physical OCPP occupancy counts as occupied without double-counting the
    # same plug when a VidyutOne booking already overlaps this minute.
    if physically_busy(charger.physical_status):
        occupancy_now = True
    physical_down = physically_down(charger.physical_status)

    peak = 18 <= now.hour < 22
    if (
        charger.status == "MAINTENANCE"
        or charger.availability is False
        or occupancy_now
        or physical_down
        or upcoming >= HIGH_BOOKINGS_2H
    ):
        level = CongestionLevel.HIGH
    elif upcoming >= MODERATE_BOOKINGS_2H or (peak and upcoming >= 1):
        level = CongestionLevel.MODERATE
    else:
        level = CongestionLevel.LOW

    wait = min(WAIT_CAP_MIN, WAIT_MINUTES[level.value] + upcoming * WAIT_PER_BOOKING_MIN)
    busy = "6 PM–8 PM (peak tariff window)" if peak or level == CongestionLevel.HIGH else "No concentrated busy period from current bookings"
    detail = (
        f"{upcoming} overlapping booking(s) in the next 2 hours; "
        f"occupied now={occupancy_now}; availability={charger.availability}; "
        f"physical_status={charger.physical_status or 'AVAILABLE'}."
    )
    provenance = "DERIVED" if relevant else "ESTIMATED"
    return CongestionResult(
        charger_id=charger.id,
        level=level,
        estimated_wait_minutes=round(wait, 1),
        upcoming_bookings_2h=upcoming,
        occupancy_now=occupancy_now,
        busy_period_label=busy,
        provenance=provenance,
        detail=detail,
    )


def station_key(charger: ChargerSnap) -> str:
    if charger.site_id:
        return f"site:{charger.site_id}"
    return f"charger:{charger.id}"


def station_utilization(
    chargers: list[ChargerSnap],
    bookings: list[BookingSnap],
    now: datetime,
) -> dict[str, float]:
    """Busy plugs / plugs at the same station. DERIVED from overlapping bookings."""
    now = _aware(now)
    by_station: dict[str, list[ChargerSnap]] = {}
    for charger in chargers:
        by_station.setdefault(station_key(charger), []).append(charger)
    result: dict[str, float] = {}
    for key, members in by_station.items():
        busy = 0
        for charger in members:
            cong = predict_congestion(charger, bookings, now)
            if (
                cong.occupancy_now
                or charger.availability is False
                or charger.status == "MAINTENANCE"
                or physically_down(charger.physical_status)
            ):
                busy += 1
        result[key] = busy / max(len(members), 1)
    return result


def _availability_score(charger: ChargerSnap) -> float:
    if physically_down(charger.physical_status) or charger.status == "MAINTENANCE":
        return 5.0
    if physically_busy(charger.physical_status) or charger.availability is False:
        return 15.0
    if charger.availability is True:
        return 100.0
    return 50.0


def _congestion_score(level: CongestionLevel) -> float:
    if level == CongestionLevel.LOW:
        return 100.0
    if level == CongestionLevel.MODERATE:
        return 55.0
    return 15.0


def _why(row: ScoredCharger, alternative_to: ScoredCharger | None) -> str:
    cong = row.congestion.level.value.replace("_", " ").title()
    bits = [
        f"{row.congestion.estimated_wait_minutes:.0f} min estimated wait ({cong} demand)",
        f"{row.charge_minutes:.0f} min charge at {row.charger.power_kw or FALLBACK_POWER_KW:.0f} kW",
        f"₹{row.cost:.0f} estimated cost",
        f"{row.km:.1f} km away",
    ]
    if alternative_to is not None and alternative_to.charger.id != row.charger.id:
        wait_delta = alternative_to.wait_minutes - row.wait_minutes
        cost_delta = alternative_to.cost - row.cost
        km_delta = row.km - alternative_to.km
        extra = []
        if wait_delta > 1:
            extra.append(f"{wait_delta:.0f} min less waiting")
        if cost_delta > 1:
            extra.append(f"₹{cost_delta:.0f} lower estimated cost")
        if km_delta > 0.2:
            extra.append(f"{km_delta:.1f} km farther")
        if extra:
            return (
                f"Better overall outcome than {alternative_to.charger.name}: "
                + ", ".join(extra)
                + f". Score {row.overall_score:.0f}/100."
            )
    return (
        "Recommended because it balances low waiting time, cost and distance. "
        + "; ".join(bits)
        + "."
    )


def score_chargers(
    *,
    origin_lat: float,
    origin_lon: float,
    chargers: list[ChargerSnap],
    bookings: list[BookingSnap],
    now: datetime,
    energy_kwh: float,
    range_km: float | None,
    preference: str = PREFERENCE_BALANCED,
) -> list[ScoredCharger]:
    preference = preference if preference in VALID_PREFERENCES else PREFERENCE_BALANCED
    weights = PREFERENCE_WEIGHTS[preference]
    now = _aware(now)
    energy = max(energy_kwh, 0.5)
    util = station_utilization(chargers, bookings, now)
    distances = [haversine_km(origin_lat, origin_lon, c.latitude, c.longitude) for c in chargers]
    max_km = max(distances) if distances else 1.0
    if range_km is not None and range_km > 0:
        max_km = max(range_km, 1.0)

    draft: list[ScoredCharger] = []
    costs: list[float] = []
    for charger, km in zip(chargers, distances):
        reachable = True if range_km is None else km <= range_km
        cong = predict_congestion(charger, bookings, now)
        power = float(charger.power_kw) if charger.power_kw and charger.power_kw > 0 else FALLBACK_POWER_KW
        tariff = float(charger.price_per_kwh) if charger.price_per_kwh and charger.price_per_kwh > 0 else FALLBACK_TARIFF
        charge_minutes = (energy / power) * 60.0
        travel_minutes = (km / ESTIMATED_TRAVEL_KMH) * 60.0
        tier = calculate_slot_price(now, tariff)
        cost = round(energy * float(tier["price"]), 2)
        costs.append(cost)
        draft.append(
            ScoredCharger(
                charger=charger,
                km=round(km, 2),
                wait_minutes=cong.estimated_wait_minutes,
                charge_minutes=round(charge_minutes, 1),
                travel_minutes=round(travel_minutes, 1),
                energy_kwh=round(energy, 2),
                cost=cost,
                congestion=cong,
                overall_score=0.0,
                factors={},
                why="",
                reachable=reachable,
                station_utilization=round(util.get(station_key(charger), 0.0), 3),
            )
        )

    max_cost = max(costs) if costs else 1.0
    scored: list[ScoredCharger] = []
    for row in draft:
        factors = {
            "availability": _availability_score(row.charger),
            "wait": _clamp(100.0 * (1.0 - row.wait_minutes / WAIT_SCORE_CAP_MIN)),
            "distance": _clamp(100.0 * (1.0 - row.km / max_km)) if max_km > 0 else 100.0,
            "charge_time": _clamp(100.0 * (1.0 - row.charge_minutes / CHARGE_SCORE_CAP_MIN)),
            "cost": _clamp(100.0 * (1.0 - row.cost / max_cost)) if max_cost > 0 else 100.0,
            "congestion": _congestion_score(row.congestion.level),
        }
        row.factors = factors
        row.overall_score = round(sum(weights[key] * factors[key] for key in weights), 1)
        scored.append(row)

    reachable_rows = [row for row in scored if row.reachable]
    pool = reachable_rows or scored
    pool.sort(key=lambda row: (-row.overall_score, row.km, row.cost))
    fastest_candidate = min(pool, key=lambda row: row.travel_minutes + row.wait_minutes + row.charge_minutes) if pool else None
    for row in scored:
        row.why = _why(row, fastest_candidate)
    scored.sort(key=lambda row: (not row.reachable, -row.overall_score, row.km))
    return scored


def _optimizer_eligible(row: ScoredCharger) -> bool:
    charger = row.charger
    if physically_down(charger.physical_status) or physically_busy(charger.physical_status):
        return False
    if charger.status == "MAINTENANCE" or charger.availability is False:
        return False
    if row.congestion.occupancy_now:
        return False
    return True


def _total_time(row: ScoredCharger) -> float:
    return row.travel_minutes + row.wait_minutes + row.charge_minutes


def pick_optimizer(rows: list[ScoredCharger]) -> OptimizerPicks:
    """FASTEST = min travel+wait+charge; CHEAPEST = min estimated cost using
    existing tariffs; BEST OVERALL = max overall_score with PREFERENCE_WEIGHTS.

    Picks differ only when the pool contains real trade-offs. Physical down
    or busy chargers are excluded.
    """
    pool = [row for row in rows if row.reachable and _optimizer_eligible(row)]
    if not pool:
        return OptimizerPicks(fastest=None, cheapest=None, best_overall=None)
    fastest = min(pool, key=_total_time)
    cheapest = min(pool, key=lambda row: (row.cost, _total_time(row)))
    best = max(pool, key=lambda row: (row.overall_score, -_total_time(row), -row.cost))
    return OptimizerPicks(fastest=fastest, cheapest=cheapest, best_overall=best)


def recommend_alternative(rows: list[ScoredCharger]) -> tuple[ScoredCharger | None, ScoredCharger | None]:
    """If the raw-fastest plug (lowest charge time / highest kW) is congested,
    recommend a better overall neighbour so the network does not dump every
    driver on the same station."""
    pool = [row for row in rows if row.reachable]
    if len(pool) < 2:
        return None, None
    raw_fastest = min(pool, key=lambda row: (row.charge_minutes, -float(row.charger.power_kw or 0)))
    usable = [row for row in pool if _optimizer_eligible(row)]
    best_pool = usable or pool
    best = max(best_pool, key=lambda row: row.overall_score)
    physically_blocked = physically_busy(raw_fastest.charger.physical_status) or physically_down(
        raw_fastest.charger.physical_status
    )
    if physically_blocked and best.charger.id != raw_fastest.charger.id:
        return raw_fastest, best
    if raw_fastest.congestion.level == CongestionLevel.HIGH and best.charger.id != raw_fastest.charger.id:
        if best.overall_score >= raw_fastest.overall_score or best.wait_minutes + 5 < raw_fastest.wait_minutes:
            return raw_fastest, best
    if raw_fastest.station_utilization >= 0.7 and best.station_utilization + 0.2 < raw_fastest.station_utilization:
        if best.charger.id != raw_fastest.charger.id:
            return raw_fastest, best
    return None, None


def recommend_smart_time(
    *,
    charger: ChargerSnap,
    bookings: list[BookingSnap],
    now: datetime,
    energy_kwh: float,
    hours_ahead: int = 18,
) -> SmartTimeResult | None:
    """Best slot in the next `hours_ahead` using existing peak/off-peak tariffs
    plus DERIVED booking density for that hour. Does not replace pricing_service."""
    now = _aware(now)
    energy = max(energy_kwh, 0.5)
    tariff = float(charger.price_per_kwh) if charger.price_per_kwh and charger.price_per_kwh > 0 else FALLBACK_TARIFF
    current_tier = calculate_slot_price(now, tariff)
    current_cost = round(energy * float(current_tier["price"]), 2)

    best: tuple[float, datetime, dict, CongestionLevel] | None = None
    cursor = now.replace(minute=0 if now.minute < 30 else 30, second=0, microsecond=0)
    if cursor <= now:
        cursor += timedelta(minutes=30)

    end = now + timedelta(hours=hours_ahead)
    while cursor <= end:
        hour_start = cursor.replace(minute=0, second=0, microsecond=0)
        hour_end = hour_start + timedelta(hours=1)
        density = 0
        for row in counted_bookings(bookings):
            if row.charger_id != charger.id:
                continue
            start, stop = _booking_window(row)
            if _overlap(start, stop, hour_start, hour_end):
                density += 1
        if physically_busy(charger.physical_status) and hour_start <= now < hour_end and density == 0:
            density += 1
        demand = (
            CongestionLevel.HIGH
            if density >= HIGH_BOOKINGS_2H
            else CongestionLevel.MODERATE
            if density >= 1
            else CongestionLevel.LOW
        )
        tier = calculate_slot_price(cursor, tariff)
        cost = energy * float(tier["price"])
        demand_penalty = {"LOW": 0.0, "MODERATE": 25.0, "HIGH": 60.0}[demand.value]
        score = cost + demand_penalty
        if best is None or score < best[0]:
            best = (score, cursor, tier, demand)
        cursor += timedelta(minutes=30)

    if best is None:
        return None
    _, slot, tier, demand = best
    est_cost = round(energy * float(tier["price"]), 2)
    savings = round(max(0.0, current_cost - est_cost), 2)
    label = slot.strftime("%I:%M %p").lstrip("0")
    detail = (
        "Uses the existing time-of-use tariff (peak 18:00–22:00 UTC, off-peak "
        "11:00–16:00 and 22:00–06:00) plus booking density for that hour."
    )
    return SmartTimeResult(
        slot_iso=slot.isoformat(),
        label=label,
        estimated_cost=est_cost,
        current_cost=current_cost,
        savings=savings,
        is_off_peak=bool(tier["is_off_peak"]),
        is_peak=bool(tier["is_peak"]),
        expected_demand=demand,
        provenance="DERIVED",
        detail=detail,
    )


def _cell_id(lat: float, lon: float) -> tuple[str, float, float]:
    lat_i = round(lat / GAP_CELL_DEG)
    lon_i = round(lon / GAP_CELL_DEG)
    clat = lat_i * GAP_CELL_DEG
    clon = lon_i * GAP_CELL_DEG
    return f"cell:{lat_i}:{lon_i}", clat, clon


def detect_capacity_gaps(
    *,
    chargers: list[ChargerSnap],
    bookings: list[BookingSnap],
    now: datetime,
    sites: list[tuple[str, str, float, float, str]],
) -> list[CapacityGap]:
    """sites tuples: (id, name, lat, lon, recommendation). Aggregated only -- no PII."""
    now = _aware(now)
    day_ago = now - timedelta(hours=24)
    buckets: dict[str, dict] = {}
    for charger in chargers:
        cid, clat, clon = _cell_id(charger.latitude, charger.longitude)
        bucket = buckets.setdefault(
            cid,
            {"lat": clat, "lon": clon, "chargers": [], "kw": 0.0, "names": []},
        )
        bucket["chargers"].append(charger)
        bucket["kw"] += float(charger.power_kw) if charger.power_kw else 0.0
        bucket["names"].append(charger.name)

    gaps: list[CapacityGap] = []
    for cid, bucket in buckets.items():
        members: list[ChargerSnap] = bucket["chargers"]
        bookings_24h = 0
        high = 0
        for charger in members:
            for row in bookings:
                if row.status not in GAP_BOOKING_STATUSES:
                    continue
                if row.charger_id != charger.id:
                    continue
                start, _end = _booking_window(row)
                if day_ago <= start <= now + timedelta(hours=2):
                    bookings_24h += 1
            if predict_congestion(charger, bookings, now).level == CongestionLevel.HIGH:
                high += 1
        n = max(len(members), 1)
        util = high / n
        per = bookings_24h / n
        if per >= GAP_BOOKINGS_PER_CHARGER_HIGH or util >= 0.5:
            demand = DemandLevel.HIGH
        elif per >= 1 or util >= 0.25:
            demand = DemandLevel.MEDIUM
        else:
            demand = DemandLevel.LOW
        total_kw = bucket["kw"]
        if n <= 1 or total_kw < GAP_KW_LOW:
            capacity = CapacityLevel.LOW
        elif total_kw < 150:
            capacity = CapacityLevel.MEDIUM
        else:
            capacity = CapacityLevel.HIGH
        congestion = CongestionLevel.HIGH if demand == DemandLevel.HIGH else CongestionLevel.MODERATE if demand == DemandLevel.MEDIUM else CongestionLevel.LOW
        if demand == DemandLevel.HIGH and capacity != CapacityLevel.HIGH:
            action = "Additional charging infrastructure recommended."
        elif demand == DemandLevel.MEDIUM and capacity == CapacityLevel.LOW:
            action = "Monitor load; consider extra capacity if bookings keep rising."
        else:
            continue

        nearest = None
        best_d = 1e9
        for site_id, site_name, slat, slon, rec in sites:
            d = haversine_km(bucket["lat"], bucket["lon"], slat, slon)
            if d < best_d:
                best_d = d
                nearest = (site_id, site_name, rec, d)
        area = nearest[1] if nearest and nearest[3] <= 8 else f"{bucket['lat']:.2f}°N, {bucket['lon']:.2f}°E"
        gaps.append(
            CapacityGap(
                cell_id=cid,
                area_label=area,
                latitude=bucket["lat"],
                longitude=bucket["lon"],
                charger_count=len(members),
                total_kw=round(total_kw, 1),
                bookings_24h=bookings_24h,
                peak_utilization=round(util * 100.0, 1),
                demand=demand,
                capacity=capacity,
                expected_congestion=congestion,
                nearest_site_id=nearest[0] if nearest else None,
                nearest_site_name=nearest[1] if nearest else None,
                site_recommendation=nearest[2] if nearest else None,
                action=action,
                provenance="DERIVED",
                detail=(
                    f"{len(members)} charger(s), {total_kw:.0f} kW, {bookings_24h} counted "
                    f"bookings in 24h. No personal identities included."
                ),
            )
        )
    gaps.sort(key=lambda g: (g.demand != DemandLevel.HIGH, -g.peak_utilization))
    return gaps
