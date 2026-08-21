from datetime import UTC, datetime

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


def _engine_kwargs(database_url: str) -> dict:
    """SQLAlchemy engine options compatible with local Postgres and Supabase.

    Supabase's transaction pooler (port 6543 / *.pooler.supabase.com) does not
    support prepared statements the way psycopg expects, so they are disabled.
    """
    connect_args: dict = {"connect_timeout": 10}
    pooled = ":6543" in database_url or "pooler.supabase.com" in database_url
    if pooled:
        connect_args["prepare_threshold"] = None
    kwargs: dict = {
        "pool_pre_ping": True,
        "future": True,
        "connect_args": connect_args,
    }
    if pooled:
        kwargs["pool_size"] = 5
        kwargs["max_overflow"] = 5
    return kwargs


settings = get_settings()

engine = create_engine(settings.DATABASE_URL, **_engine_kwargs(settings.DATABASE_URL))

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, class_=Session)


class Base(DeclarativeBase):
    """Declarative base for SQLAlchemy models.

    Latitude/longitude remain floats for the V1 API. PostGIS is enabled in
    migrations so radius queries can be added later without changing this Base.
    """


def utcnow() -> datetime:
    return datetime.now(UTC)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
