"""Tests for POST /api/driver/voice-assistant (backend/app/services/lyzr_driver_service.py).

Mirrors tests/test_assistant.py's structure: TestClient(app) + monkeypatch on
requests.post, so these never make a real network call to Lyzr. Auth is
mocked via app.dependency_overrides[get_current_user], the same pattern as
tests/test_auth_guards.py -- this endpoint is driver-only, like every other
route in app/api/routes/driver.py.
"""

from __future__ import annotations

import requests
import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.main import app
from app.models.user import ROLE_DRIVER
from app.schemas.auth import AuthUser
from app.services import lyzr_driver_service

DRIVER = AuthUser(id="user-driver-test", email="driver@example.com", full_name="Driver Test", role=ROLE_DRIVER)


class _FakeLyzrResponse:
    def __init__(self, status_code: int = 200, json_body: dict | None = None):
        self.status_code = status_code
        self._json_body = json_body if json_body is not None else {}

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise requests.HTTPError(f"status {self.status_code}")

    def json(self) -> dict:
        return self._json_body


def _configure_lyzr(monkeypatch: pytest.MonkeyPatch, *, api_key: str, agent_id: str) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "LYZR_API_KEY", api_key)
    monkeypatch.setattr(settings, "LYZR_DRIVER_AGENT_ID", agent_id)


@pytest.fixture
def client_as_driver():
    app.dependency_overrides[get_current_user] = lambda: DRIVER
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_voice_assistant_returns_reply_on_success(client_as_driver, monkeypatch: pytest.MonkeyPatch):
    _configure_lyzr(monkeypatch, api_key="test-key", agent_id="test-driver-agent")

    def fake_post(url, headers=None, json=None, timeout=None):
        assert url == lyzr_driver_service.LYZR_CHAT_URL
        assert headers["x-api-key"] == "test-key"
        assert json["agent_id"] == "test-driver-agent"
        assert json["session_id"] == "session-abc"
        assert json["system_prompt_variables"]["driver_context"] == "Koramangala DC, 1.2 km, available."
        return _FakeLyzrResponse(200, {"response": "Koramangala DC is your closest available charger."})

    monkeypatch.setattr(lyzr_driver_service.requests, "post", fake_post)

    response = client_as_driver.post(
        "/api/driver/voice-assistant",
        json={"message": "which charger is closest?", "session_id": "session-abc", "context_summary": "Koramangala DC, 1.2 km, available."},
    )

    assert response.status_code == 200
    assert response.json()["reply"] == "Koramangala DC is your closest available charger."


def test_voice_assistant_returns_graceful_fallback_on_failure(client_as_driver, monkeypatch: pytest.MonkeyPatch):
    _configure_lyzr(monkeypatch, api_key="test-key", agent_id="test-driver-agent")
    monkeypatch.setattr(lyzr_driver_service.requests, "post", lambda *a, **k: (_ for _ in ()).throw(requests.Timeout("simulated timeout")))

    response = client_as_driver.post(
        "/api/driver/voice-assistant",
        json={"message": "hi", "session_id": "session-xyz", "context_summary": "no chargers in range"},
    )

    assert response.status_code == 200  # never a 500 to the frontend
    assert response.json()["reply"] == lyzr_driver_service.UNAVAILABLE_MESSAGE


def test_voice_assistant_not_configured_short_circuits_without_network_call(client_as_driver, monkeypatch: pytest.MonkeyPatch):
    _configure_lyzr(monkeypatch, api_key="", agent_id="")

    def fail_if_called(*args, **kwargs):
        raise AssertionError("requests.post must not be called when Lyzr isn't configured")

    monkeypatch.setattr(lyzr_driver_service.requests, "post", fail_if_called)

    response = client_as_driver.post(
        "/api/driver/voice-assistant",
        json={"message": "hi", "session_id": "session-none", "context_summary": ""},
    )

    assert response.status_code == 200
    assert response.json()["reply"] == lyzr_driver_service.NOT_CONFIGURED_MESSAGE


def test_voice_assistant_without_jwt_is_401():
    client = TestClient(app)
    response = client.post(
        "/api/driver/voice-assistant",
        json={"message": "hi", "session_id": "session-noauth", "context_summary": ""},
    )
    assert response.status_code == 401
