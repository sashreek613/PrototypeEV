from fastapi.testclient import TestClient

from app.api.deps import get_current_user
from app.main import app
from app.models.user import ROLE_DRIVER, ROLE_OPERATOR, ROLE_PLANNER
from app.schemas.auth import AuthUser
from app.services.user_service import _role_from_metadata

client = TestClient(app)


def test_operator_role_accepted_from_metadata() -> None:
    assert _role_from_metadata({"role": "operator"}) == ROLE_OPERATOR
    assert _role_from_metadata({"role": "admin"}) is None


def test_operator_endpoints_require_auth() -> None:
    assert client.get("/api/operator/chargers").status_code == 401
    assert client.get("/api/operator/analytics").status_code == 401
    assert client.get("/api/planner/capacity-gaps").status_code == 401
    assert client.post(
        "/api/driver/intelligence",
        json={"latitude": 12.97, "longitude": 77.59},
    ).status_code == 401


def test_driver_cannot_access_operator_or_capacity_gaps() -> None:
    driver = AuthUser(id="user-driver-test", email="d@e.f", full_name="D", role=ROLE_DRIVER)
    app.dependency_overrides[get_current_user] = lambda: driver
    try:
        assert client.get("/api/operator/chargers").status_code == 403
        assert client.get("/api/planner/capacity-gaps").status_code == 403
        assert client.get("/api/me/operator").status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_operator_cannot_access_planner_or_driver_me() -> None:
    operator = AuthUser(id="user-operator-test", email="o@e.f", full_name="O", role=ROLE_OPERATOR)
    app.dependency_overrides[get_current_user] = lambda: operator
    try:
        assert client.get("/api/me/planner").status_code == 403
        assert client.get("/api/me/driver").status_code == 403
        assert client.get("/api/planner/capacity-gaps").status_code == 403
        assert client.get("/api/operator/chargers").status_code == 200
        assert client.get("/api/me/operator").status_code in {200, 404}
    finally:
        app.dependency_overrides.clear()


def test_planner_can_read_capacity_gaps_shape() -> None:
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
        response = client.get("/api/planner/capacity-gaps")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    finally:
        app.dependency_overrides.clear()


def test_driver_intelligence_shape() -> None:
    driver = AuthUser(id="user-driver-demo", email="driver.demo@vidyutone.local", full_name="Nikhil", role=ROLE_DRIVER)
    app.dependency_overrides[get_current_user] = lambda: driver
    try:
        response = client.post(
            "/api/driver/intelligence",
            json={"latitude": 12.9716, "longitude": 77.5946, "preference": "balanced", "range_km": 20},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["preference"] == "balanced"
        assert "ranked" in body
        assert "optimizer" in body
        assert "weights" in body
        assert "availability" in body["weights"]
    finally:
        app.dependency_overrides.clear()


def test_demo_operator_token_uses_isolated_catalog() -> None:
    from app.services.operator_demo_store import DEMO_OPERATOR_TOKEN, reset_demo_state

    reset_demo_state()
    headers = {"Authorization": f"Bearer {DEMO_OPERATOR_TOKEN}"}
    listed = client.get("/api/operator/chargers", headers=headers)
    assert listed.status_code == 200
    ids = {row["id"] for row in listed.json()}
    assert any(item.startswith("demo-op-") for item in ids)
    analytics = client.get("/api/operator/analytics", headers=headers)
    assert analytics.status_code == 200
    body = analytics.json()
    assert body["total_chargers"] >= 1
    assert "insights" in body
    assert body["provenance_note"].startswith("DEMO")
    kinds = {item["kind"] for item in body["insights"]}
    assert "visibility" in kinds
    me = client.get("/api/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["role"] == "operator"
    assert me.json()["organization"] == "Operator Demo Mode"


def test_operator_isolation_create_and_list() -> None:
    from app.database.session import SessionLocal
    from app.models.charger import Charger
    from app.models.user import User
    from app.services.user_service import get_or_create_profile

    db = SessionLocal()
    uid_a = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0aa1"
    uid_b = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0bb1"
    try:
        for uid, email, name in (
            (uid_a, "op.a.regression@example.invalid", "Op A"),
            (uid_b, "op.b.regression@example.invalid", "Op B"),
        ):
            leftover = db.get(User, uid)
            if leftover is not None:
                db.query(Charger).filter(Charger.operator_id == uid).delete()
                db.delete(leftover)
                db.commit()
            get_or_create_profile(db, user_id=uid, email=email, metadata={"role": "operator", "full_name": name})

        op_a = AuthUser(id=uid_a, email="op.a.regression@example.invalid", full_name="Op A", role=ROLE_OPERATOR)
        op_b = AuthUser(id=uid_b, email="op.b.regression@example.invalid", full_name="Op B", role=ROLE_OPERATOR)
        app.dependency_overrides[get_current_user] = lambda: op_a
        created = client.post(
            "/api/operator/chargers",
            json={
                "name": "Op A Hub",
                "latitude": 12.97,
                "longitude": 77.59,
                "power_kw": 60,
                "price_per_kwh": 16.5,
                "connector_type": "CCS2",
            },
        )
        assert created.status_code == 200, created.text
        charger_id = created.json()["id"]
        listed_a = client.get("/api/operator/chargers")
        assert listed_a.status_code == 200
        assert any(row["id"] == charger_id for row in listed_a.json())

        app.dependency_overrides[get_current_user] = lambda: op_b
        listed_b = client.get("/api/operator/chargers")
        assert listed_b.status_code == 200
        assert all(row["id"] != charger_id for row in listed_b.json())
        patched = client.patch(f"/api/operator/chargers/{charger_id}", json={"status": "MAINTENANCE"})
        assert patched.status_code == 404
        app.dependency_overrides.clear()

        from app.services.operator_demo_store import DEMO_OPERATOR_TOKEN, reset_demo_state

        reset_demo_state()
        demo_patch = client.patch(
            f"/api/operator/chargers/{charger_id}",
            json={"status": "MAINTENANCE"},
            headers={"Authorization": f"Bearer {DEMO_OPERATOR_TOKEN}"},
        )
        assert demo_patch.status_code == 404
    finally:
        app.dependency_overrides.clear()
        for uid in (uid_a, uid_b):
            db.query(Charger).filter(Charger.operator_id == uid).delete()
            leftover = db.get(User, uid)
            if leftover is not None:
                db.delete(leftover)
        db.commit()
        db.close()
