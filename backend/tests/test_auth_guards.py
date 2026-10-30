from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.api.deps import get_current_user
from app.main import app
from app.models.user import ROLE_ADMIN, ROLE_DRIVER, ROLE_PLANNER
from app.schemas.auth import AuthUser

client = TestClient(app)


def test_health_remains_public() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_root_health_is_public() -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "VidyutOne backend"}


def test_me_without_jwt_is_401() -> None:
    response = client.get("/api/me")
    assert response.status_code == 401


def test_booking_without_jwt_is_401() -> None:
    response = client.post(
        "/api/bookings",
        json={
            "charger_id": "chg-koramangala-01",
            "slot_time": "2026-08-20T10:30:00+00:00",
            "price": 18.5,
        },
    )
    assert response.status_code == 401


def test_planner_cannot_call_driver_endpoint() -> None:
    planner = AuthUser(
        id="user-planner-test",
        email="planner@example.com",
        full_name="Planner Test",
        role=ROLE_PLANNER,
    )
    app.dependency_overrides[get_current_user] = lambda: planner
    try:
        response = client.get("/api/me/driver")
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_driver_cannot_call_planner_endpoint() -> None:
    driver = AuthUser(
        id="user-driver-test",
        email="driver@example.com",
        full_name="Driver Test",
        role=ROLE_DRIVER,
    )
    app.dependency_overrides[get_current_user] = lambda: driver
    try:
        response = client.get("/api/me/planner")
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_pending_planner_cannot_call_planner_endpoint() -> None:
    planner = AuthUser(
        id="user-planner-pending-test",
        email="planner.pending@example.com",
        full_name="Pending Planner",
        role=ROLE_PLANNER,
        is_verified=False,
        is_active=False,
        verification_status="pending",
    )
    app.dependency_overrides[get_current_user] = lambda: planner
    try:
        response = client.get("/api/me/planner")
        assert response.status_code == 403
        assert "pending verification" in response.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()


def test_charging_summary_without_jwt_is_401() -> None:
    response = client.get("/api/driver/charging-summary")
    assert response.status_code == 401


def test_charging_quote_without_jwt_is_401() -> None:
    response = client.post(
        "/api/driver/charging-quote",
        json={
            "charger_id": "chg-koramangala-01",
            "slots": ["2026-08-20T23:00:00+00:00"],
        },
    )
    assert response.status_code == 401


def test_planner_cannot_read_driver_charging_summary() -> None:
    planner = AuthUser(
        id="user-planner-test",
        email="planner@example.com",
        full_name="Planner Test",
        role=ROLE_PLANNER,
    )
    app.dependency_overrides[get_current_user] = lambda: planner
    try:
        response = client.get("/api/driver/charging-summary")
        assert response.status_code == 403
        history = client.get("/api/driver/charging-history")
        assert history.status_code == 403
        quote = client.post(
            "/api/driver/charging-quote",
            json={
                "charger_id": "chg-koramangala-01",
                "slots": ["2026-08-20T23:00:00+00:00"],
            },
        )
        assert quote.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_driver_charging_summary_returns_only_own_empty_history() -> None:
    driver = AuthUser(
        id="user-driver-charging-test-no-rows",
        email="driver.charging@example.com",
        full_name="Charging Test",
        role=ROLE_DRIVER,
    )
    app.dependency_overrides[get_current_user] = lambda: driver
    try:
        response = client.get("/api/driver/charging-summary")
        assert response.status_code == 200
        body = response.json()
        assert body["history"] == []
        assert body["month"]["sessions"] == 0
        assert body["last_session"] is None
        assert body["insight"] is None
        assert body["total_energy_kwh"] is None
        history = client.get("/api/driver/charging-history")
        assert history.status_code == 200
        assert history.json() == []
    finally:
        app.dependency_overrides.clear()


def test_valid_user_can_read_me_shape() -> None:
    user = AuthUser(
        id="user-driver-demo",
        email="driver.demo@vidyutone.local",
        full_name="Nikhil",
        role=ROLE_DRIVER,
    )
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        response = client.get("/api/me")
        # 200 if the demo user exists in the connected DB; 404 if seed has not run.
        assert response.status_code in {200, 404}
        if response.status_code == 200:
            body = response.json()
            assert body["role"] == ROLE_DRIVER
            assert "created_at" in body
    finally:
        app.dependency_overrides.clear()


def test_auth_user_role_helpers() -> None:
    now_iso = datetime.now(timezone.utc).isoformat()
    assert now_iso
    planner = AuthUser(id="1", email="a@b.c", full_name="A", role=ROLE_PLANNER)
    driver = AuthUser(id="2", email="d@e.f", full_name="D", role=ROLE_DRIVER)
    admin = AuthUser(id="3", email="g@h.i", full_name="G", role=ROLE_ADMIN)
    assert planner.is_planner
    assert driver.is_driver
    assert admin.is_admin
    assert not planner.is_driver
    assert not planner.is_admin
    assert not driver.is_planner
    assert not driver.is_admin
    assert not admin.is_planner
    assert not admin.is_driver


def test_admin_can_list_planners() -> None:
    admin = AuthUser(
        id="user-admin-test",
        email="admin@example.com",
        full_name="Admin Test",
        role=ROLE_ADMIN,
    )
    app.dependency_overrides[get_current_user] = lambda: admin
    try:
        response = client.get("/api/admin/planners")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    finally:
        app.dependency_overrides.clear()


def test_driver_cannot_call_admin_endpoint() -> None:
    driver = AuthUser(
        id="user-driver-test",
        email="driver@example.com",
        full_name="Driver Test",
        role=ROLE_DRIVER,
    )
    app.dependency_overrides[get_current_user] = lambda: driver
    try:
        response = client.get("/api/admin/planners")
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_planner_cannot_call_admin_endpoint() -> None:
    planner = AuthUser(
        id="user-planner-test",
        email="planner@example.com",
        full_name="Planner Test",
        role=ROLE_PLANNER,
        is_verified=True,
        is_active=True,
        verification_status="approved",
    )
    app.dependency_overrides[get_current_user] = lambda: planner
    try:
        response = client.get("/api/admin/planners")
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_approved_planner_passes_require_planner() -> None:
    planner = AuthUser(
        id="user-planner-approved-test",
        email="planner.approved@example.com",
        full_name="Approved Planner",
        role=ROLE_PLANNER,
        is_verified=True,
        is_active=True,
        verification_status="approved",
    )
    app.dependency_overrides[get_current_user] = lambda: planner
    try:
        response = client.get("/api/me/planner")
        assert response.status_code in {200, 404}
    finally:
        app.dependency_overrides.clear()


def test_rejected_planner_cannot_call_planner_endpoint() -> None:
    planner = AuthUser(
        id="user-planner-rejected-test",
        email="planner.rejected@example.com",
        full_name="Rejected Planner",
        role=ROLE_PLANNER,
        is_verified=False,
        is_active=False,
        verification_status="rejected",
    )
    app.dependency_overrides[get_current_user] = lambda: planner
    try:
        response = client.get("/api/me/planner")
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_metadata_cannot_grant_or_demote_admin() -> None:
    from app.database.session import SessionLocal
    from app.models.user import User
    from app.services.user_service import _role_from_metadata, get_or_create_profile

    assert _role_from_metadata({"role": "admin"}) is None
    assert _role_from_metadata({"role": "planner"}) == ROLE_PLANNER
    assert _role_from_metadata({"role": "driver"}) == ROLE_DRIVER
    assert _role_from_metadata({}) is None

    uid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee00a1"
    email = "vidyutone.auth.regression.admin@example.invalid"
    db = SessionLocal()
    try:
        leftover = db.get(User, uid)
        if leftover is not None:
            db.delete(leftover)
            db.commit()

        created = get_or_create_profile(
            db,
            user_id=uid,
            email=email,
            metadata={"role": "admin", "full_name": "Spoof Admin"},
        )
        assert created.role == ROLE_DRIVER
        assert created.verification_status == "approved"

        created.role = ROLE_ADMIN
        created.is_verified = True
        created.is_active = True
        created.verification_status = "approved"
        db.add(created)
        db.commit()

        again = get_or_create_profile(
            db,
            user_id=uid,
            email=email,
            metadata={"role": "driver", "full_name": "Spoof Driver"},
        )
        assert again.role == ROLE_ADMIN
    finally:
        leftover = db.get(User, uid)
        if leftover is not None:
            db.delete(leftover)
            db.commit()
        db.close()


def test_new_planner_profile_is_pending() -> None:
    from app.database.session import SessionLocal
    from app.models.user import User
    from app.services.user_service import get_or_create_profile

    uid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee00p1"
    email = "vidyutone.auth.regression.planner@example.invalid"
    db = SessionLocal()
    try:
        leftover = db.get(User, uid)
        if leftover is not None:
            db.delete(leftover)
            db.commit()

        created = get_or_create_profile(
            db,
            user_id=uid,
            email=email,
            metadata={"role": "planner", "full_name": "Pending Planner", "organization": "BESCOM"},
        )
        assert created.role == ROLE_PLANNER
        assert created.verification_status == "pending"
        assert created.is_verified is False
        assert created.is_active is False

        from app.services.user_service import approve_planner, reject_planner

        approved = approve_planner(db, uid)
        assert approved.verification_status == "approved"
        assert approved.is_verified is True
        assert approved.is_active is True

        rejected = reject_planner(db, uid, "not eligible")
        assert rejected.verification_status == "rejected"
        assert rejected.is_verified is False
        assert rejected.is_active is False
    finally:
        leftover = db.get(User, uid)
        if leftover is not None:
            db.delete(leftover)
            db.commit()
        db.close()
