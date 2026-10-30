import pytest
from sqlalchemy import inspect, text

from app.database.session import Base, engine


def _ensure_sqlite_ocpp_columns() -> None:
    if "sqlite" not in str(engine.url):
        return
    insp = inspect(engine)
    if "chargers" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("chargers")}
    statements = []
    if "physical_status" not in cols:
        statements.append("ALTER TABLE chargers ADD COLUMN physical_status VARCHAR(32) DEFAULT 'AVAILABLE' NOT NULL")
    if "physical_status_source" not in cols:
        statements.append("ALTER TABLE chargers ADD COLUMN physical_status_source VARCHAR(32) DEFAULT 'MANUAL' NOT NULL")
    if "physical_status_updated_at" not in cols:
        statements.append("ALTER TABLE chargers ADD COLUMN physical_status_updated_at DATETIME")
    if "ocpp_identity" not in cols:
        statements.append("ALTER TABLE chargers ADD COLUMN ocpp_identity VARCHAR(64)")
    if statements:
        with engine.begin() as conn:
            for sql in statements:
                conn.execute(text(sql))


@pytest.fixture(autouse=True, scope="session")
def setup_test_db():
    if "sqlite" in str(engine.url):
        Base.metadata.create_all(bind=engine)
        _ensure_sqlite_ocpp_columns()
        yield
        Base.metadata.drop_all(bind=engine)
    else:
        yield
