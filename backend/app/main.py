import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.schemas.health import HealthResponse

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()
    from app.database.session import Base, engine
    import app.models  # noqa: F401 -- ensures all model definitions are registered
    try:
        Base.metadata.create_all(bind=engine)
    except Exception:
        logger.exception(
            "Could not reach DATABASE_URL at startup. The HTTP server will still bind; "
            "data routes fail until the database is reachable. If the host is "
            "db.<project>.supabase.co (IPv6-only), use the pooler host *.pooler.supabase.com."
        )

    # Safe startup config validation -- never logs secret values
    logger.info(
        "VidyutOne startup: GEMINI_API_KEY configured=%s, LYZR_API_KEY configured=%s, LYZR_DRIVER_AGENT_ID configured=%s",
        bool(settings.GEMINI_API_KEY),
        bool(settings.LYZR_API_KEY),
        bool(settings.LYZR_DRIVER_AGENT_ID),
    )

    app = FastAPI(
        title="VidyutOne API",
        description="EV mobility intelligence platform — MVP backend",
        version="0.1.0",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router, prefix="/api")

    from app.api.routes.ocpp_ws import router as ocpp_router

    app.include_router(ocpp_router)

    @app.get("/", response_model=HealthResponse, tags=["health"])
    def get_root() -> HealthResponse:
        return HealthResponse(status="ok", service="VidyutOne backend")

    return app


app = create_app()
