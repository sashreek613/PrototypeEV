from fastapi import APIRouter

from app.api.routes import (
    admin,
    assistant,
    bookings,
    capacity_gaps,
    chargers,
    consideration,
    driver,
    fast_track,
    health,
    me,
    operator,
    payments,
    planner_reports,
    pricing,
    sites,
    vehicles,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(me.router, tags=["auth"])
api_router.include_router(sites.router, tags=["sites"])
api_router.include_router(chargers.router, tags=["chargers"])
api_router.include_router(bookings.router, tags=["bookings"])
api_router.include_router(vehicles.router, tags=["vehicles"])
api_router.include_router(pricing.router, tags=["pricing"])
api_router.include_router(driver.router, tags=["driver"])
api_router.include_router(admin.router, tags=["admin"])
api_router.include_router(assistant.router, tags=["assistant"])
api_router.include_router(consideration.router, tags=["planner"])
api_router.include_router(planner_reports.router, tags=["planner"])
api_router.include_router(capacity_gaps.router, tags=["planner"])
api_router.include_router(payments.router, tags=["payments"])
api_router.include_router(operator.router)
api_router.include_router(fast_track.router)
