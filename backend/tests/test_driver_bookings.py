import pytest
from datetime import datetime, timezone, timedelta
from fastapi import status
from fastapi.testclient import TestClient

from app.main import app
from app.api.deps import get_current_user
from app.database.session import SessionLocal
from app.models.site import Site
from app.models.charger import Charger
from app.models.user import User, ROLE_DRIVER
from app.models.booking import Booking
from app.models.payment import Payment
from app.schemas.auth import AuthUser
from app.schemas.booking import BookingStatus

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def seed_test_data():
    db = SessionLocal()
    b_ids = [b.id for b in db.query(Booking.id).filter(Booking.charger_id == "charger-test").all()]
    if b_ids:
        db.query(Payment).filter(Payment.booking_id.in_(b_ids)).delete(synchronize_session=False)
        db.query(Booking).filter(Booking.charger_id == "charger-test").delete(synchronize_session=False)
        db.commit()
    
    driver1 = User(
        id="driver-1",
        full_name="Driver One",
        email="driver1@example.com",
        role=ROLE_DRIVER,
    )
    driver2 = User(
        id="driver-2",
        full_name="Driver Two",
        email="driver2@example.com",
        role=ROLE_DRIVER,
    )
    db.merge(driver1)
    db.merge(driver2)
    
    site = Site(
        id="site-test",
        name="Test Site",
        latitude=12.9716,
        longitude=77.5946,
        demand_score=80.0,
        grid_capacity_score=80.0,
        accessibility_score=80.0,
        charger_gap_score=80.0,
    )
    db.merge(site)
    
    charger = Charger(
        id="charger-test",
        name="Test Charger",
        latitude=12.9716,
        longitude=77.5946,
        power_kw=22,
        price_per_kwh=15.0,
        availability=True,
        connector_type="CCS2",
        site_id="site-test",
    )
    db.merge(charger)
    db.commit()
    db.close()
    yield


def test_driver_can_create_and_retrieve_booking():
    user1 = AuthUser(id="driver-1", email="driver1@example.com", full_name="Driver One", role=ROLE_DRIVER)
    app.dependency_overrides[get_current_user] = lambda: user1
    
    try:
        slot_time = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        response = client.post(
            "/api/bookings",
            json={
                "charger_id": "charger-test",
                "slot_time": slot_time,
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["user_id"] == "driver-1"
        assert data["charger_id"] == "charger-test"
        assert data["status"] == "PAYMENT_PENDING"
        assert data["duration_minutes"] > 0
        booking_id = data["id"]
        
        get_res = client.get(f"/api/bookings/{booking_id}")
        assert get_res.status_code == 200
        assert get_res.json()["id"] == booking_id
        
        list_res = client.get("/api/bookings")
        assert list_res.status_code == 200
        bookings_list = list_res.json()
        assert len(bookings_list) >= 1
        assert any(b["id"] == booking_id for b in bookings_list)
        
        user2 = AuthUser(id="driver-2", email="driver2@example.com", full_name="Driver Two", role=ROLE_DRIVER)
        app.dependency_overrides[get_current_user] = lambda: user2
        get_other = client.get(f"/api/bookings/{booking_id}")
        assert get_other.status_code == 403
        
    finally:
        app.dependency_overrides.clear()


def test_ocm_charger_booking_does_not_require_chargers_row():
    """Pay on a live OpenChargeMap hub must INSERT a booking without a chargers FK row."""
    user1 = AuthUser(id="driver-1", email="driver1@example.com", full_name="Driver One", role=ROLE_DRIVER)
    app.dependency_overrides[get_current_user] = lambda: user1
    # Unique far-future slot so leftover PAYMENT_PENDING rows from earlier runs
    # of this test do not 409-conflict (30-minute windows).
    slot_time = (datetime.now(timezone.utc) + timedelta(days=45, minutes=datetime.now(timezone.utc).microsecond % 1000)).isoformat()
    created_id = None
    try:
        response = client.post(
            "/api/bookings",
            json={
                "charger_id": "ocm-309285-0",
                "slot_time": slot_time,
                "duration_minutes": 30,
            },
        )
        assert response.status_code == 201, response.text
        data = response.json()
        created_id = data["id"]
        assert data["charger_id"] == "ocm-309285-0"
        assert data["status"] == "PAYMENT_PENDING"
        assert data["price"] > 0
    finally:
        app.dependency_overrides.clear()
        if created_id:
            db = SessionLocal()
            try:
                db.query(Payment).filter(Payment.booking_id == created_id).delete(synchronize_session=False)
                leftover = db.get(Booking, created_id)
                if leftover is not None:
                    db.delete(leftover)
                db.commit()
            finally:
                db.close()


def test_driver_cancellation_rules():
    user1 = AuthUser(id="driver-1", email="driver1@example.com", full_name="Driver One", role=ROLE_DRIVER)
    user2 = AuthUser(id="driver-2", email="driver2@example.com", full_name="Driver Two", role=ROLE_DRIVER)
    
    db = SessionLocal()
    b_booked = Booking(
        id="b-booked",
        user_id="driver-1",
        charger_id="charger-test",
        slot_time=datetime.now(timezone.utc) + timedelta(hours=1),
        price=100.0,
        status=BookingStatus.BOOKED.value,
        duration_minutes=30,
    )
    b_active = Booking(
        id="b-active",
        user_id="driver-1",
        charger_id="charger-test",
        slot_time=datetime.now(timezone.utc) - timedelta(minutes=15),
        price=100.0,
        status=BookingStatus.BOOKED.value,
        duration_minutes=30,
    )
    b_completed = Booking(
        id="b-completed",
        user_id="driver-1",
        charger_id="charger-test",
        slot_time=datetime.now(timezone.utc) - timedelta(hours=2),
        price=100.0,
        status=BookingStatus.BOOKED.value,
        duration_minutes=30,
    )
    b_cancelled = Booking(
        id="b-cancelled",
        user_id="driver-1",
        charger_id="charger-test",
        slot_time=datetime.now(timezone.utc) + timedelta(hours=5),
        price=100.0,
        status=BookingStatus.CANCELLED.value,
        duration_minutes=30,
    )
    
    db.merge(b_booked)
    db.merge(b_active)
    db.merge(b_completed)
    db.merge(b_cancelled)
    db.commit()
    db.close()
    
    try:
        app.dependency_overrides[get_current_user] = lambda: user2
        res = client.patch("/api/bookings/b-booked/cancel")
        assert res.status_code == 403
        
        app.dependency_overrides[get_current_user] = lambda: user1
        res = client.patch("/api/bookings/b-booked/cancel")
        assert res.status_code == 200
        assert res.json()["status"] == "CANCELLED"
        
        res = client.patch("/api/bookings/b-active/cancel")
        assert res.status_code == 400
        
        res = client.patch("/api/bookings/b-completed/cancel")
        assert res.status_code == 400
        
        res = client.patch("/api/bookings/b-cancelled/cancel")
        assert res.status_code == 400
        
    finally:
        app.dependency_overrides.clear()


def test_double_booking_prevention():
    user1 = AuthUser(id="driver-1", email="driver1@example.com", full_name="Driver One", role=ROLE_DRIVER)
    user2 = AuthUser(id="driver-2", email="driver2@example.com", full_name="Driver Two", role=ROLE_DRIVER)
    
    app.dependency_overrides[get_current_user] = lambda: user1
    
    slot_time = (datetime.now(timezone.utc) + timedelta(hours=10)).replace(minute=0, second=0, microsecond=0)
    slot_iso = slot_time.isoformat()
    
    try:
        # User 1 books a 60 min slot [T, T+60]
        res1 = client.post(
            "/api/bookings",
            json={
                "charger_id": "charger-test",
                "slot_time": slot_iso,
                "duration_minutes": 60,
            }
        )
        assert res1.status_code == 201
        b1 = res1.json()
        assert b1["status"] == "PAYMENT_PENDING"
        
        # User 2 tries to book an overlapping slot [T+30, T+60] -> should be rejected with 409
        app.dependency_overrides[get_current_user] = lambda: user2
        overlap_slot_iso = (slot_time + timedelta(minutes=30)).isoformat()
        res2 = client.post(
            "/api/bookings",
            json={
                "charger_id": "charger-test",
                "slot_time": overlap_slot_iso,
                "duration_minutes": 30,
            }
        )
        assert res2.status_code == 409
        assert "This charging slot is no longer available" in res2.json()["detail"]
        
        # User 2 tries to book a non-overlapping slot [T+60, T+90] -> should succeed
        non_overlap_slot_iso = (slot_time + timedelta(minutes=60)).isoformat()
        res3 = client.post(
            "/api/bookings",
            json={
                "charger_id": "charger-test",
                "slot_time": non_overlap_slot_iso,
                "duration_minutes": 30,
            }
        )
        assert res3.status_code == 201
    finally:
        app.dependency_overrides.clear()


def test_razorpay_payment_order_and_verification(monkeypatch):
    import hmac
    import hashlib
    from app.core.config import get_settings
    from app.services import payment_service
    
    settings = get_settings()
    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", "rzp_test_key_123")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "secret_key_456")
    
    # Mock Razorpay Client
    class MockRazorpayOrder:
        def create(self, data):
            return {"id": "order_test_789", "amount": data["amount"], "currency": data["currency"]}
            
    class MockRazorpayClient:
        def __init__(self, auth):
            self.order = MockRazorpayOrder()
            
    monkeypatch.setattr(payment_service, "_razorpay_client", lambda: MockRazorpayClient(auth=("", "")))
    
    user1 = AuthUser(id="driver-1", email="driver1@example.com", full_name="Driver One", role=ROLE_DRIVER)
    app.dependency_overrides[get_current_user] = lambda: user1
    
    slot_time = (datetime.now(timezone.utc) + timedelta(hours=20)).isoformat()
    
    try:
        # 1. Create booking
        res_book = client.post(
            "/api/bookings",
            json={
                "charger_id": "charger-test",
                "slot_time": slot_time,
                "duration_minutes": 30,
            }
        )
        assert res_book.status_code == 201
        booking = res_book.json()
        booking_id = booking["id"]
        assert booking["status"] == "PAYMENT_PENDING"
        
        # 2. Create payment order
        res_order = client.post(
            "/api/payments/create-order",
            json={"booking_id": booking_id, "amount": booking["price"], "currency": "INR"}
        )
        assert res_order.status_code == 200
        order_info = res_order.json()
        assert order_info["razorpay_order_id"] == "order_test_789"
        assert order_info["razorpay_key_id"] == "rzp_test_key_123"
        
        # 3. Invalid signature verification -> fails
        res_fail = client.post(
            "/api/payments/verify",
            json={
                "booking_id": booking_id,
                "razorpay_order_id": "order_test_789",
                "razorpay_payment_id": "pay_test_001",
                "razorpay_signature": "invalid_sig",
            }
        )
        assert res_fail.status_code == 400
        
        # 4. Valid signature verification -> succeeds & confirms booking
        valid_sig = hmac.new(
            b"secret_key_456",
            b"order_test_789|pay_test_001",
            hashlib.sha256
        ).hexdigest()
        
        res_verify = client.post(
            "/api/payments/verify",
            json={
                "booking_id": booking_id,
                "razorpay_order_id": "order_test_789",
                "razorpay_payment_id": "pay_test_001",
                "razorpay_signature": valid_sig,
            }
        )
        assert res_verify.status_code == 200
        verify_data = res_verify.json()
        assert verify_data["success"] is True
        assert verify_data["booking_status"] == "BOOKED"
        assert verify_data["payment_status"] == "PAID"
        
        # Verify booking in DB is now BOOKED
        res_get = client.get(f"/api/bookings/{booking_id}")
        assert res_get.status_code == 200
        assert res_get.json()["status"] == "BOOKED"
    finally:
        app.dependency_overrides.clear()
