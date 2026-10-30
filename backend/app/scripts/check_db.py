"""Print whether FastAPI can reach DATABASE_URL. Does not print the password."""

from urllib.parse import urlparse

from sqlalchemy import text

from app.core.config import get_settings
from app.database.session import engine


def main() -> None:
    settings = get_settings()
    parsed = urlparse(settings.DATABASE_URL)
    print(f"driver={parsed.scheme}")
    print(f"host={parsed.hostname}")
    print(f"port={parsed.port}")
    print(f"database={parsed.path.lstrip('/')}")
    with engine.connect() as connection:
        one = connection.execute(text("SELECT 1")).scalar()
        print(f"select_1={one}")
        tables = connection.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' ORDER BY table_name"
            )
        ).fetchall()
        print("tables=" + ",".join(row[0] for row in tables))


if __name__ == "__main__":
    main()
