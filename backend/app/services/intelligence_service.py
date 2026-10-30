"""Assemble network intelligence from chargers + bookings.

Keeps PII out of the engine: only charger snapshots and anonymized booking
windows are passed down. Vehicle energy/range come from the authenticated
driver's own vehicle when present.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.engines.network_intelligence import (
    PREFERENCE_WEIGHTS,
    BookingSnap,
    ChargerSnap,
    ScoredCharger,
    detect_capacity_gaps,
    pick_optimizer,
    recommend_alternative,
    recommend_smart_time,
    score_chargers,
)
from app.models.booking import Booking
from app.schemas.intelligence import (
    AlternativeRead,
    CapacityGapRead,
    CongestionRead,
    IntelligenceRequest,
    IntelligenceResponse,
    OptimizerOptionRead,
    RecommendedChargerRead,
    SmartTimeRead,
)
from app.services import charger_service, charging_service, vehicle_service
from app.services.demo_intelligence import DEMO_TRADEOFF_IDS, merge_demo_chargers, tradeoff_bookings
from app.services.site_service import list_sites


def _to_snap(charger) -> ChargerSnap:
    return ChargerSnap(
        id=charger.id,
        name=charger.name,
        latitude=charger.latitude,
        longitude=charger.longitude,
        power_kw=float(charger.power_kw) if charger.power_kw is not None else None,
        price_per_kwh=float(charger.price_per_kwh) if charger.price_per_kwh is not None else None,
        availability=charger.availability,
        site_id=charger.site_id,
        status=getattr(charger, "status", None),
        provenance=getattr(charger.provenance, "value", charger.provenance) if getattr(charger, "provenance", None) else "DEMO",
        physical_status=getattr(charger, "physical_status", None),
    )


def _booking_snaps(db: Session) -> list[BookingSnap]:
    rows = db.query(Booking).all()
    snaps: list[BookingSnap] = []
    for row in rows:
        snaps.append(
            BookingSnap(
                charger_id=row.charger_id,
                slot_time=row.slot_time,
                duration_minutes=getattr(row, "duration_minutes", 30) or 30,
                status=row.status,
                price=float(row.price or 0),
            )
        )
    return snaps


def _to_recommended(row: ScoredCharger) -> RecommendedChargerRead:
    cong = row.congestion
    return RecommendedChargerRead(
        charger_id=row.charger.id,
        name=row.charger.name,
        km=row.km,
        power_kw=row.charger.power_kw,
        price_per_kwh=row.charger.price_per_kwh,
        estimated_wait_minutes=row.wait_minutes,
        estimated_charge_minutes=row.charge_minutes,
        estimated_travel_minutes=row.travel_minutes,
        estimated_cost=row.cost,
        energy_kwh=row.energy_kwh,
        overall_score=row.overall_score,
        congestion=CongestionRead(
            charger_id=cong.charger_id,
            level=cong.level.value,
            estimated_wait_minutes=cong.estimated_wait_minutes,
            upcoming_bookings_2h=cong.upcoming_bookings_2h,
            occupancy_now=cong.occupancy_now,
            busy_period_label=cong.busy_period_label,
            provenance=cong.provenance,
            detail=cong.detail,
        ),
        station_utilization=row.station_utilization,
        why=row.why,
        reachable=row.reachable,
        provenance="DEMO" if str(getattr(row.charger, "provenance", "") or "").upper() == "DEMO" else "DERIVED",
    )


def build_intelligence(
    db: Session,
    user_id: str,
    payload: IntelligenceRequest,
    *,
    include_demo: bool = False,
) -> IntelligenceResponse:
    chargers = charger_service.list_chargers(db)
    chargers = merge_demo_chargers(
        chargers,
        allowed=include_demo,
        origin_lat=payload.latitude,
        origin_lon=payload.longitude,
    )
    if payload.charger_ids:
        wanted = set(payload.charger_ids)
        if include_demo:
            wanted |= set(DEMO_TRADEOFF_IDS)
        chargers = [c for c in chargers if c.id in wanted]
    snaps = [_to_snap(c) for c in chargers]
    bookings = _booking_snaps(db)
    now = datetime.now(timezone.utc)
    if include_demo:
        bookings = bookings + tradeoff_bookings(now)

    energy = payload.energy_kwh
    if energy is None:
        vehicles = vehicle_service.list_user_vehicles(db, user_id)
        primary = next((v for v in vehicles if v.is_primary), vehicles[0] if vehicles else None)
        if primary is not None:
            energy = charging_service.estimated_energy_kwh(
                battery_capacity_kwh=primary.battery_capacity_kwh,
                current_battery_pct=primary.current_battery_pct,
                charger_power_kw=50.0,
                duration_minutes=None,
            )
        else:
            energy = 15.0

    scored = score_chargers(
        origin_lat=payload.latitude,
        origin_lon=payload.longitude,
        chargers=snaps,
        bookings=bookings,
        now=now,
        energy_kwh=energy,
        range_km=payload.range_km,
        preference=payload.preference.value,
    )
    ranked = [_to_recommended(row) for row in scored[:25]]
    recommended = ranked[0] if ranked else None
    congestion = [item.congestion for item in ranked]
    picks = pick_optimizer(scored)
    optimizer: list[OptimizerOptionRead] = []
    if picks.fastest:
        optimizer.append(
            OptimizerOptionRead(
                kind="fastest",
                charger=_to_recommended(picks.fastest),
                reason="Lowest estimated total journey time (travel + wait + charge).",
            )
        )
    if picks.cheapest:
        optimizer.append(
            OptimizerOptionRead(
                kind="cheapest",
                charger=_to_recommended(picks.cheapest),
                reason="Lowest estimated charging cost using the current time-of-use tariff.",
            )
        )
    if picks.best_overall:
        optimizer.append(
            OptimizerOptionRead(
                kind="best_overall",
                charger=_to_recommended(picks.best_overall),
                reason="Best balance of time, cost and congestion (existing recommendation weights).",
            )
        )

    congested, alt = recommend_alternative(scored)
    alternative = None
    if congested and alt:
        alternative = AlternativeRead(
            congested=_to_recommended(congested),
            recommended=_to_recommended(alt),
            extra_km=round(alt.km - congested.km, 2),
            wait_saved_minutes=round(congested.wait_minutes - alt.wait_minutes, 1),
            cost_saved=round(congested.cost - alt.cost, 2),
            explanation=(
                f"{congested.charger.name} has high expected congestion "
                f"({congested.congestion.level.value}). "
                f"Recommended alternative: {alt.charger.name}."
            ),
        )

    smart = None
    target = picks.best_overall or (scored[0] if scored else None)
    if target is not None:
        time_rec = recommend_smart_time(
            charger=target.charger,
            bookings=bookings,
            now=now,
            energy_kwh=energy,
            hours_ahead=payload.hours_ahead,
        )
        if time_rec is not None:
            smart = SmartTimeRead(
                charger_id=target.charger.id,
                charger_name=target.charger.name,
                slot_iso=time_rec.slot_iso,
                label=time_rec.label,
                estimated_cost=time_rec.estimated_cost,
                current_cost=time_rec.current_cost,
                savings=time_rec.savings,
                is_off_peak=time_rec.is_off_peak,
                is_peak=time_rec.is_peak,
                expected_demand=time_rec.expected_demand.value,
                provenance=time_rec.provenance,
                detail=time_rec.detail,
            )

    return IntelligenceResponse(
        preference=payload.preference.value,
        recommended=recommended,
        ranked=ranked,
        congestion=congestion,
        optimizer=optimizer,
        alternative=alternative,
        smart_time=smart,
        weights=dict(PREFERENCE_WEIGHTS[payload.preference.value]),
        provenance_note=(
            "Scores are DERIVED from live charger fields and counted bookings; "
            "wait minutes and travel time are ESTIMATED rule-based proxies. "
            "Not an ML model."
            + (
                " Compare-options DEMO chargers are labeled Demo and are not OCPP telemetry."
                if include_demo
                else ""
            )
        ),
    )


def list_capacity_gaps(db: Session) -> list[CapacityGapRead]:
    chargers = [_to_snap(c) for c in charger_service.list_chargers(db)]
    bookings = _booking_snaps(db)
    now = datetime.now(timezone.utc)
    site_rows = []
    for site in list_sites(db, limit=200, offset=0):
        rec = site.recommendation.value if hasattr(site.recommendation, "value") else str(site.recommendation)
        site_rows.append((site.id, site.name, site.latitude, site.longitude, rec))
    gaps = detect_capacity_gaps(chargers=chargers, bookings=bookings, now=now, sites=site_rows)
    return [
        CapacityGapRead(
            cell_id=g.cell_id,
            area_label=g.area_label,
            latitude=g.latitude,
            longitude=g.longitude,
            charger_count=g.charger_count,
            total_kw=g.total_kw,
            bookings_24h=g.bookings_24h,
            peak_utilization=g.peak_utilization,
            demand=g.demand.value,
            capacity=g.capacity.value,
            expected_congestion=g.expected_congestion.value,
            nearest_site_id=g.nearest_site_id,
            nearest_site_name=g.nearest_site_name,
            site_recommendation=g.site_recommendation,
            action=g.action,
            provenance=g.provenance,
            detail=g.detail,
        )
        for g in gaps
    ]
