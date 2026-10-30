-- Optional paste for the Supabase SQL editor if you prefer not to run Alembic
-- against the cloud database. Alembic remains the preferred migration tool.
-- Enable PostGIS first: Database → Extensions → postgis

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    role VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_users_email UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS sites (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    demand_score DOUBLE PRECISION NOT NULL,
    grid_capacity_score DOUBLE PRECISION NOT NULL,
    accessibility_score DOUBLE PRECISION NOT NULL,
    charger_gap_score DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS chargers (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    power_kw INTEGER NOT NULL,
    price_per_kwh DOUBLE PRECISION NOT NULL,
    availability BOOLEAN NOT NULL,
    connector_type VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL,
    site_id VARCHAR(64) NOT NULL REFERENCES sites (id),
    created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_chargers_site_id ON chargers (site_id);

CREATE TABLE IF NOT EXISTS bookings (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users (id),
    charger_id VARCHAR(64) NOT NULL REFERENCES chargers (id),
    slot_time TIMESTAMPTZ NOT NULL,
    price DOUBLE PRECISION NOT NULL,
    status VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_bookings_user_id ON bookings (user_id);
CREATE INDEX IF NOT EXISTS ix_bookings_charger_id ON bookings (charger_id);

-- Alembic version stamp (only if you applied this SQL instead of `alembic upgrade head`)
CREATE TABLE IF NOT EXISTS alembic_version (
    version_num VARCHAR(32) NOT NULL PRIMARY KEY
);
INSERT INTO alembic_version (version_num)
VALUES ('0001_initial_v1')
ON CONFLICT (version_num) DO NOTHING;
