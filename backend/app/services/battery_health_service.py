"""Battery-health-by-age estimation -- a fourth, optional multiplier in
range_service.py's transparent adjustment chain, same "show your work"
pattern as temperature / climate control / driving profile there.

Age is ALWAYS derived fresh from the vehicle's stored `registration_date`
(never re-typed by the driver, never persisted as a number) -- see the
column comment on Vehicle.registration_date in app/models/vehicle.py.

The degradation curve below is a widely-cited, general-purpose approximation
of lithium-ion EV battery calendar aging, not a manufacturer- or
chemistry-specific curve: large-fleet studies (Geotab's multi-year EV
battery-degradation study; Recurrent's battery-health reporting) consistently
show a faster loss in the first year followed by a slower, roughly linear
decline thereafter. This mirrors the same "conservative, documented
approximation -- not a lab curve" disclaimer already used for the
temperature bands in range_service.py.
"""

from __future__ import annotations

from datetime import date

# First-year loss is typically the steepest (new-cell settling, initial
# calendar aging) -- ~5% by the one-year mark is a conservative, commonly
# cited figure.
FIRST_YEAR_LOSS_FRACTION = 0.05

# After year 1, degradation flattens to a slower roughly-linear rate.
# ~1.8%/year is within the commonly cited 1.5-2.5%/year range for modern
# lithium-ion EV packs under normal use.
ANNUAL_LOSS_FRACTION_AFTER_YEAR_ONE = 0.018

# Batteries don't degrade to zero in practice -- most manufacturer warranties
# and fleet data treat ~70-80% retained capacity as "end of useful EV life,"
# but this floor is deliberately more conservative (lower) than that so the
# estimate never implies a vehicle is unusable; it's a floor on how far this
# approximation will adjust range downward, not a claim about the real pack.
MIN_HEALTH_MULTIPLIER = 0.50


def estimate_battery_health(registration_date: date | None, *, today: date | None = None) -> tuple[float, str]:
    """Returns (multiplier, human-readable detail string).

    registration_date=None -> (1.0, "no adjustment") -- unknown age is
    treated as a documented no-op, same pattern as a missing temperature
    reading in range_service.py.
    """
    if registration_date is None:
        return 1.0, "registration date not on file -- no battery-health adjustment applied"

    as_of = today or date.today()
    age_days = (as_of - registration_date).days
    if age_days <= 0:
        return 1.0, "vehicle registered today or in the future -- no battery-health adjustment applied"

    age_years = age_days / 365.25

    if age_years <= 1.0:
        multiplier = 1.0 - FIRST_YEAR_LOSS_FRACTION * age_years
    else:
        multiplier = (1.0 - FIRST_YEAR_LOSS_FRACTION) - ANNUAL_LOSS_FRACTION_AFTER_YEAR_ONE * (age_years - 1.0)

    multiplier = max(MIN_HEALTH_MULTIPLIER, min(1.0, multiplier))

    age_label = f"{age_years:.1f} years old" if age_years >= 1 else f"{age_days} days old"
    retained_pct = round(multiplier * 100)
    detail = f"Vehicle is {age_label} -- estimated battery health ~{retained_pct}% of original capacity"
    return multiplier, detail
