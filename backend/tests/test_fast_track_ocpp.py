from fastapi.testclient import TestClient

from app.api.deps import get_current_user
from app.engines.occupancy import SOURCE_OCPP, SOURCE_SIMULATOR
from app.main import app
from app.models.user import ROLE_DRIVER, ROLE_OPERATOR
from app.schemas.auth import AuthUser
from app.services.physical_status_service import apply_status
from app.services.user_service import get_or_create_profile

client = TestClient(app)


def test_fast_track_occupied_rejects_confirm() -> None:
    from app.database.session import SessionLocal
    from app.models.charger import Charger
    from app.models.user import User

    db = SessionLocal()
    uid = "bbbbbbbb-cccc-4ddd-8eee-ffff00001111"
    op_id = "bbbbbbbb-cccc-4ddd-8eee-ffff00002222"
    try:
        leftover = db.get(User, uid)
        if leftover is not None:
            db.query(Charger).filter(Charger.operator_id == op_id).delete()
            db.delete(leftover)
            db.commit()
        leftover_op = db.get(User, op_id)
        if leftover_op is not None:
            db.query(Charger).filter(Charger.operator_id == op_id).delete()
            db.delete(leftover_op)
            db.commit()
        get_or_create_profile(db, user_id=uid, email="ft.driver@example.invalid", metadata={"role": "driver", "full_name": "FT Driver"})
        get_or_create_profile(db, user_id=op_id, email="ft.op@example.invalid", metadata={"role": "operator", "full_name": "FT Op"})

        op = AuthUser(id=op_id, email="ft.op@example.invalid", full_name="FT Op", role=ROLE_OPERATOR)
        app.dependency_overrides[get_current_user] = lambda: op
        created = client.post(
            "/api/operator/chargers",
            json={
                "name": "FT Hub",
                "latitude": 12.97,
                "longitude": 77.59,
                "power_kw": 60,
                "price_per_kwh": 16.5,
                "connector_type": "CCS2",
            },
        )
        assert created.status_code == 200, created.text
        charger_id = created.json()["id"]

        simulated = client.post(
            f"/api/operator/chargers/{charger_id}/simulate-status",
            json={"physical_status": "CHARGING", "source": SOURCE_SIMULATOR},
        )
        assert simulated.status_code == 200, simulated.text
        assert simulated.json()["physical_status"] == "CHARGING"
        assert simulated.json()["physical_status_source"] == SOURCE_SIMULATOR
        assert simulated.json()["occupancy"] == "OCCUPIED"
        assert simulated.json()["unexpected_occupancy"] is True

        driver = AuthUser(id=uid, email="ft.driver@example.invalid", full_name="FT Driver", role=ROLE_DRIVER)
        app.dependency_overrides[get_current_user] = lambda: driver
        checked = client.post("/api/driver/fast-track/check", json={"charger_id": charger_id})
        assert checked.status_code == 200
        assert checked.json()["occupancy"] == "OCCUPIED"
        assert checked.json()["bookable"] is False
        live = client.get(f"/api/chargers/{charger_id}/live-status")
        assert live.status_code == 200
        assert live.json()["occupancy"] == "OCCUPIED"

        confirm = client.post("/api/driver/fast-track/confirm", json={"charger_id": charger_id})
        assert confirm.status_code == 409
        assert "occupied" in confirm.json()["detail"].lower()

        booking = client.post(
            "/api/bookings",
            json={"charger_id": charger_id, "slot_time": "2026-09-06T12:00:00+00:00", "duration_minutes": 30},
        )
        assert booking.status_code == 409
    finally:
        app.dependency_overrides.clear()
        db.query(Charger).filter(Charger.operator_id == op_id).delete()
        for user_id in (uid, op_id):
            leftover = db.get(User, user_id)
            if leftover is not None:
                db.delete(leftover)
        db.commit()
        db.close()


def test_fast_track_available_then_second_confirm_conflicts() -> None:
    from app.database.session import SessionLocal
    from app.models.booking import Booking
    from app.models.charger import Charger
    from app.models.user import User

    db = SessionLocal()
    uid = "bbbbbbbb-cccc-4ddd-8eee-ffff00003333"
    op_id = "bbbbbbbb-cccc-4ddd-8eee-ffff00004444"
    try:
        for user_id in (uid, op_id):
            leftover = db.get(User, user_id)
            if leftover is not None:
                db.query(Booking).filter(Booking.user_id == user_id).delete()
                db.query(Charger).filter(Charger.operator_id == user_id).delete()
                db.delete(leftover)
        db.commit()
        get_or_create_profile(db, user_id=uid, email="ft2.driver@example.invalid", metadata={"role": "driver", "full_name": "FT2"})
        get_or_create_profile(db, user_id=op_id, email="ft2.op@example.invalid", metadata={"role": "operator", "full_name": "FT2 Op"})
        op = AuthUser(id=op_id, email="ft2.op@example.invalid", full_name="FT2 Op", role=ROLE_OPERATOR)
        app.dependency_overrides[get_current_user] = lambda: op
        created = client.post(
            "/api/operator/chargers",
            json={
                "name": "FT Free",
                "latitude": 12.97,
                "longitude": 77.59,
                "power_kw": 50,
                "price_per_kwh": 15,
                "connector_type": "CCS2",
            },
        )
        assert created.status_code == 200, created.text
        charger_id = created.json()["id"]
        driver = AuthUser(id=uid, email="ft2.driver@example.invalid", full_name="FT2", role=ROLE_DRIVER)
        app.dependency_overrides[get_current_user] = lambda: driver
        first = client.post("/api/driver/fast-track/confirm", json={"charger_id": charger_id})
        assert first.status_code == 200, first.text
        second = client.post("/api/driver/fast-track/confirm", json={"charger_id": charger_id})
        assert second.status_code == 409
    finally:
        app.dependency_overrides.clear()
        db.query(Booking).filter(Booking.user_id == uid).delete()
        db.query(Charger).filter(Charger.operator_id == op_id).delete()
        for user_id in (uid, op_id):
            leftover = db.get(User, user_id)
            if leftover is not None:
                db.delete(leftover)
        db.commit()
        db.close()


def test_apply_status_source_ocpp_vs_simulator() -> None:
    from app.database.session import SessionLocal
    from app.models.charger import Charger
    from app.models.user import User

    db = SessionLocal()
    op_id = "bbbbbbbb-cccc-4ddd-8eee-ffff00005555"
    try:
        leftover = db.get(User, op_id)
        if leftover is not None:
            db.query(Charger).filter(Charger.operator_id == op_id).delete()
            db.delete(leftover)
            db.commit()
        get_or_create_profile(db, user_id=op_id, email="src.op@example.invalid", metadata={"role": "operator", "full_name": "Src"})
        op = AuthUser(id=op_id, email="src.op@example.invalid", full_name="Src", role=ROLE_OPERATOR)
        app.dependency_overrides[get_current_user] = lambda: op
        created = client.post(
            "/api/operator/chargers",
            json={
                "name": "Src Hub",
                "latitude": 12.97,
                "longitude": 77.59,
                "power_kw": 50,
                "price_per_kwh": 15,
                "connector_type": "CCS2",
            },
        )
        charger_id = created.json()["id"]
        charger = db.get(Charger, charger_id)
        apply_status(db, charger=charger, physical_status="CHARGING", source=SOURCE_OCPP)
        db.refresh(charger)
        assert charger.physical_status_source == SOURCE_OCPP
        fake = client.post(
            f"/api/operator/chargers/{charger_id}/simulate-status",
            json={"physical_status": "AVAILABLE", "source": SOURCE_OCPP},
        )
        assert fake.status_code == 400
    finally:
        app.dependency_overrides.clear()
        db.query(Charger).filter(Charger.operator_id == op_id).delete()
        leftover = db.get(User, op_id)
        if leftover is not None:
            db.delete(leftover)
        db.commit()
        db.close()
