from datetime import datetime, timedelta, timezone

from app.engines.network_intelligence import (
    PREFERENCE_COST,
    PREFERENCE_TIME,
    BookingSnap,
    ChargerSnap,
    CongestionLevel,
    detect_capacity_gaps,
    pick_optimizer,
    predict_congestion,
    recommend_alternative,
    recommend_smart_time,
    score_chargers,
)


NOW = datetime(2026, 9, 5, 19, 0, tzinfo=timezone.utc)


def _charger(cid: str, lat: float, lon: float, power: float, price: float, avail: bool = True, site: str | None = None) -> ChargerSnap:
    return ChargerSnap(
        id=cid,
        name=cid,
        latitude=lat,
        longitude=lon,
        power_kw=power,
        price_per_kwh=price,
        availability=avail,
        site_id=site,
    )


def test_high_congestion_from_overlapping_bookings() -> None:
    charger = _charger("a", 12.97, 77.59, 150, 18)
    bookings = [
        BookingSnap("a", NOW, 30, "BOOKED"),
        BookingSnap("a", NOW + timedelta(minutes=20), 30, "BOOKED"),
        BookingSnap("a", NOW + timedelta(minutes=40), 30, "BOOKED"),
    ]
    result = predict_congestion(charger, bookings, NOW)
    assert result.level == CongestionLevel.HIGH
    assert result.upcoming_bookings_2h >= 3
    assert result.estimated_wait_minutes >= 25


def test_low_congestion_without_bookings() -> None:
    charger = _charger("a", 12.97, 77.59, 150, 18)
    result = predict_congestion(charger, [], datetime(2026, 9, 5, 11, 0, tzinfo=timezone.utc))
    assert result.level == CongestionLevel.LOW


def test_recommendation_prefers_shorter_wait_over_raw_power() -> None:
    origin_lat, origin_lon = 12.97, 77.59
    fast_busy = _charger("fast", 12.972, 77.592, 350, 22, site="s1")
    slower_free = _charger("steady", 12.975, 77.595, 150, 16, site="s2")
    bookings = [
        BookingSnap("fast", NOW, 40, "BOOKED"),
        BookingSnap("fast", NOW + timedelta(minutes=15), 40, "BOOKED"),
        BookingSnap("fast", NOW + timedelta(minutes=35), 40, "BOOKED"),
    ]
    ranked = score_chargers(
        origin_lat=origin_lat,
        origin_lon=origin_lon,
        chargers=[fast_busy, slower_free],
        bookings=bookings,
        now=NOW,
        energy_kwh=20,
        range_km=20,
        preference="balanced",
    )
    assert ranked[0].charger.id == "steady"
    assert "wait" in ranked[0].why.lower() or ranked[0].overall_score > ranked[1].overall_score


def test_minimize_cost_picks_cheaper_tariff() -> None:
    cheap = _charger("cheap", 12.971, 77.591, 50, 10)
    pricey = _charger("pricey", 12.971, 77.591, 350, 30)
    ranked = score_chargers(
        origin_lat=12.97,
        origin_lon=77.59,
        chargers=[cheap, pricey],
        bookings=[],
        now=datetime(2026, 9, 5, 11, 0, tzinfo=timezone.utc),
        energy_kwh=20,
        range_km=20,
        preference=PREFERENCE_COST,
    )
    assert ranked[0].charger.id == "cheap"


def test_optimizer_distinct_when_tradeoffs_exist() -> None:
    fast = _charger("fast", 12.971, 77.591, 350, 32)
    cheap = _charger("cheap", 12.99, 77.62, 50, 11)
    balanced = _charger("balanced", 12.98, 77.60, 150, 18)
    ranked = score_chargers(
        origin_lat=12.97,
        origin_lon=77.59,
        chargers=[fast, cheap, balanced],
        bookings=[],
        now=datetime(2026, 9, 5, 11, 0, tzinfo=timezone.utc),
        energy_kwh=20,
        range_km=50,
    )
    picks = pick_optimizer(ranked)
    assert picks.fastest is not None
    assert picks.cheapest is not None
    assert picks.best_overall is not None
    assert picks.cheapest.charger.id == "cheap"
    assert picks.fastest.charger.id == "fast"
    assert picks.fastest.charger.id != picks.cheapest.charger.id


def test_optimizer_returns_three_kinds() -> None:
    a = _charger("a", 12.971, 77.591, 350, 25)
    b = _charger("b", 12.98, 77.60, 50, 12)
    ranked = score_chargers(
        origin_lat=12.97,
        origin_lon=77.59,
        chargers=[a, b],
        bookings=[],
        now=datetime(2026, 9, 5, 11, 0, tzinfo=timezone.utc),
        energy_kwh=20,
        range_km=50,
    )
    picks = pick_optimizer(ranked)
    assert picks.fastest is not None
    assert picks.cheapest is not None
    assert picks.best_overall is not None
    assert picks.cheapest.charger.id == "b"


def test_demo_tradeoff_chargers_split_optimizer() -> None:
    from app.services.demo_intelligence import DEMO_CHEAP_ID, DEMO_FAST_ID, tradeoff_chargers

    chargers = [
        ChargerSnap(
            id=row.id,
            name=row.name,
            latitude=row.latitude,
            longitude=row.longitude,
            power_kw=row.power_kw,
            price_per_kwh=row.price_per_kwh,
            availability=True,
            site_id=None,
            status="AVAILABLE",
            provenance="DEMO",
            physical_status="AVAILABLE",
        )
        for row in tradeoff_chargers()
    ]
    ranked = score_chargers(
        origin_lat=12.9716,
        origin_lon=77.5946,
        chargers=chargers,
        bookings=[],
        now=datetime(2026, 9, 5, 11, 0, tzinfo=timezone.utc),
        energy_kwh=20,
        range_km=50,
    )
    picks = pick_optimizer(ranked)
    assert picks.fastest is not None
    assert picks.cheapest is not None
    assert picks.best_overall is not None
    assert picks.fastest.charger.id == DEMO_FAST_ID
    assert picks.cheapest.charger.id == DEMO_CHEAP_ID
    assert picks.fastest.charger.id != picks.cheapest.charger.id
    assert picks.best_overall.charger.id != picks.cheapest.charger.id


def test_alternative_when_fastest_is_congested() -> None:
    fast = _charger("fast", 12.971, 77.591, 350, 20, site="s1")
    alt = _charger("alt", 12.98, 77.60, 120, 16, site="s2")
    bookings = [
        BookingSnap("fast", NOW, 30, "BOOKED"),
        BookingSnap("fast", NOW + timedelta(minutes=20), 30, "BOOKED"),
        BookingSnap("fast", NOW + timedelta(minutes=40), 30, "BOOKED"),
    ]
    ranked = score_chargers(
        origin_lat=12.97,
        origin_lon=77.59,
        chargers=[fast, alt],
        bookings=bookings,
        now=NOW,
        energy_kwh=20,
        range_km=30,
    )
    congested, recommended = recommend_alternative(ranked)
    assert congested is not None
    assert recommended is not None
    assert recommended.charger.id == "alt"


def test_range_excludes_unreachable() -> None:
    near = _charger("near", 12.971, 77.591, 50, 18)
    far = _charger("far", 13.2, 77.8, 350, 18)
    ranked = score_chargers(
        origin_lat=12.97,
        origin_lon=77.59,
        chargers=[near, far],
        bookings=[],
        now=NOW,
        energy_kwh=10,
        range_km=5,
    )
    assert ranked[0].charger.id == "near"
    far_row = next(r for r in ranked if r.charger.id == "far")
    assert far_row.reachable is False


def test_smart_time_prefers_off_peak() -> None:
    charger = _charger("a", 12.97, 77.59, 50, 20)
    rec = recommend_smart_time(charger=charger, bookings=[], now=NOW, energy_kwh=10, hours_ahead=12)
    assert rec is not None
    assert rec.estimated_cost <= rec.current_cost
    assert rec.is_off_peak or rec.savings >= 0


def test_capacity_gap_from_high_bookings() -> None:
    chargers = [_charger("only", 12.97, 77.59, 22, 18, site=None)]
    bookings = [
        BookingSnap("only", NOW - timedelta(hours=2), 30, "COMPLETED", 100),
        BookingSnap("only", NOW - timedelta(hours=1), 30, "COMPLETED", 100),
        BookingSnap("only", NOW, 30, "BOOKED", 100),
        BookingSnap("only", NOW + timedelta(minutes=30), 30, "BOOKED", 100),
    ]
    sites = [("site-1", "Koramangala", 12.935, 77.624, "BUILD")]
    gaps = detect_capacity_gaps(chargers=chargers, bookings=bookings, now=NOW, sites=sites)
    assert gaps
    assert gaps[0].demand.value == "HIGH"
    assert "identities" in gaps[0].detail.lower() or "personal" in gaps[0].detail.lower()


def test_time_preference_weights_differ() -> None:
    assert PREFERENCE_TIME != "balanced"


def test_physical_charging_counts_as_occupied_without_booking() -> None:
    charger = _charger("plug", 12.97, 77.59, 150, 18)
    charger = ChargerSnap(**{**charger.__dict__, "physical_status": "CHARGING"})
    result = predict_congestion(charger, [], datetime(2026, 9, 5, 11, 0, tzinfo=timezone.utc))
    assert result.occupancy_now is True
    assert result.level == CongestionLevel.HIGH


def test_faulted_charger_is_not_optimizer_pick() -> None:
    down = ChargerSnap(**{**_charger("down", 12.971, 77.591, 350, 10).__dict__, "physical_status": "FAULTED"})
    ok = _charger("ok", 12.972, 77.592, 50, 20)
    ranked = score_chargers(
        origin_lat=12.97,
        origin_lon=77.59,
        chargers=[down, ok],
        bookings=[],
        now=datetime(2026, 9, 5, 11, 0, tzinfo=timezone.utc),
        energy_kwh=20,
        range_km=20,
    )
    picks = pick_optimizer(ranked)
    assert picks.fastest is not None
    assert picks.fastest.charger.id == "ok"
    assert picks.cheapest is not None
    assert picks.cheapest.charger.id == "ok"


def test_physical_occupancy_suggests_alternative() -> None:
    fast = ChargerSnap(**{**_charger("fast", 12.971, 77.591, 350, 20, site="s1").__dict__, "physical_status": "CHARGING"})
    alt = _charger("alt", 12.98, 77.60, 120, 16, site="s2")
    ranked = score_chargers(
        origin_lat=12.97,
        origin_lon=77.59,
        chargers=[fast, alt],
        bookings=[],
        now=datetime(2026, 9, 5, 11, 0, tzinfo=timezone.utc),
        energy_kwh=20,
        range_km=30,
    )
    congested, recommended = recommend_alternative(ranked)
    assert congested is not None
    assert recommended is not None
    assert congested.charger.id == "fast"
    assert recommended.charger.id == "alt"
