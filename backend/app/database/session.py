from datetime import UTC, datetime
import logging
import re
import socket
from collections.abc import Generator
from urllib.parse import quote, urlparse, urlunparse

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _host_has_ipv4(hostname: str) -> bool:
    try:
        socket.getaddrinfo(hostname, None, socket.AF_INET)
        return True
    except OSError:
        return False


def rewrite_supabase_direct_if_ipv6_only(database_url: str, pooler_host: str = "") -> str:
    """db.<ref>.supabase.co is IPv6-only. Windows without IPv6 fails DNS (11001)
    and FastAPI never binds — the frontend then shows a connection error.

    When the direct host has no A record, use the session/transaction pooler
    which publishes IPv4. Username becomes postgres.<project_ref> as required
    by Supabase pooler.
    """
    parsed = urlparse(database_url)
    host = parsed.hostname or ""
    match = re.fullmatch(r"db\.([a-z0-9]+)\.supabase\.co", host, flags=re.IGNORECASE)
    if not match:
        return database_url
    if _host_has_ipv4(host):
        return database_url
    ref = match.group(1)
    pooler = (pooler_host or "aws-0-ap-northeast-1.pooler.supabase.com").strip()
    username = parsed.username or "postgres"
    if username == "postgres":
        username = f"postgres.{ref}"
    password = parsed.password or ""
    port = parsed.port or 6543
    if port == 5432:
        port = 6543
    netloc = f"{quote(username, safe='')}:{quote(password, safe='')}@{pooler}:{port}"
    rewritten = urlunparse(parsed._replace(netloc=netloc))
    logger.warning(
        "DATABASE_URL host %s has no IPv4 record; using Supabase pooler %s:%s",
        host,
        pooler,
        port,
    )
    return rewritten


def _sqlalchemy_database_url(database_url: str) -> str:
    """Use psycopg v3. Render/Supabase often provide postgres:// or postgresql://."""
    if database_url.startswith("postgres://"):
        return "postgresql+psycopg://" + database_url.removeprefix("postgres://")
    if database_url.startswith("postgresql://"):
        return "postgresql+psycopg://" + database_url.removeprefix("postgresql://")
    return database_url


def _engine_kwargs(database_url: str) -> dict:
    """SQLAlchemy engine options compatible with local Postgres and Supabase.

    Supabase's transaction pooler (port 6543 / *.pooler.supabase.com) does not
    support prepared statements the way psycopg expects, so they are disabled.
    """
    connect_args: dict = {}
    if "sqlite" not in database_url:
        connect_args["connect_timeout"] = 10
        if "supabase.co" in database_url:
            connect_args["sslmode"] = "require"
    pooled = ":6543" in database_url or "pooler.supabase.com" in database_url
    if pooled:
        connect_args["prepare_threshold"] = None
    kwargs: dict = {
        "pool_pre_ping": True,
        "future": True,
        "connect_args": connect_args,
    }
    if "sqlite" not in database_url:
        kwargs["pool_size"] = 5
        kwargs["max_overflow"] = 5
        kwargs["pool_recycle"] = 280
        kwargs["pool_use_lifo"] = True
    return kwargs


settings = get_settings()
_database_url = rewrite_supabase_direct_if_ipv6_only(
    _sqlalchemy_database_url(settings.DATABASE_URL),
    pooler_host=getattr(settings, "SUPABASE_POOLER_HOST", "") or "",
)

engine = create_engine(_database_url, **_engine_kwargs(_database_url))

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
