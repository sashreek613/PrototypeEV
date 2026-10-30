"""Tests for POST /api/assistant/chat (backend/app/services/gemini_service.py)."""

from __future__ import annotations

import requests
import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.schemas.site import Recommendation, RecommendedSiteRead
from app.services import gemini_service, site_service


def _fake_recommended_sites(db=None, limit: int = 10) -> list[RecommendedSiteRead]:
    return [
        RecommendedSiteRead(
            rank=1,
            id="site-1",
            name="Test Metro Station",
            latitude=12.97,
            longitude=77.59,
            demand_score=90.0,
            grid_capacity_score=80.0,
            accessibility_score=70.0,
            charger_gap_score=60.0,
            site_score=85.0,
            recommendation=Recommendation.BUILD,
            factors=[],
            explanation="Demand and grid readiness both clear the bar.",
        )
    ]


class _FakeGeminiResponse:
    def __init__(self, status_code: int = 200, json_body: dict | None = None):
        self.status_code = status_code
        self._json_body = json_body if json_body is not None else {}

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise requests.HTTPError(f"status {self.status_code}")

    def json(self) -> dict:
        return self._json_body


def _configure_gemini(monkeypatch: pytest.MonkeyPatch, *, api_key: str) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "GEMINI_API_KEY", api_key)


def test_assistant_chat_returns_reply_on_success(monkeypatch: pytest.MonkeyPatch):
    _configure_gemini(monkeypatch, api_key="test-key")
    monkeypatch.setattr(site_service, "list_recommended_sites", _fake_recommended_sites)

    def fake_post(url, headers=None, json=None, timeout=None):
        assert "generativelanguage.googleapis.com" in url
        return _FakeGeminiResponse(
            200,
            {
                "candidates": [
                    {
                        "content": {
                            "parts": [{"text": "The top site is Test Metro Station."}]
                        }
                    }
                ]
            },
        )

    monkeypatch.setattr(gemini_service.requests, "post", fake_post)

    client = TestClient(app)
    response = client.post("/api/assistant/chat", json={"message": "Which site is #1?", "session_id": "session-abc"})

    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == "The top site is Test Metro Station."
    assert body["session_id"] == "session-abc"


def test_assistant_chat_returns_graceful_fallback_on_timeout(monkeypatch: pytest.MonkeyPatch):
    _configure_gemini(monkeypatch, api_key="test-key")
    monkeypatch.setattr(site_service, "list_recommended_sites", _fake_recommended_sites)

    def fake_post_timeout(url, headers=None, json=None, timeout=None):
        raise requests.Timeout("simulated timeout")

    monkeypatch.setattr(gemini_service.requests, "post", fake_post_timeout)

    client = TestClient(app)
    response = client.post("/api/assistant/chat", json={"message": "hi", "session_id": "session-xyz"})

    assert response.status_code == 200
    assert response.json()["reply"] == gemini_service.UNAVAILABLE_MESSAGE


def test_assistant_chat_returns_graceful_fallback_on_non_200(monkeypatch: pytest.MonkeyPatch):
    _configure_gemini(monkeypatch, api_key="test-key")
    monkeypatch.setattr(site_service, "list_recommended_sites", _fake_recommended_sites)
    monkeypatch.setattr(gemini_service.requests, "post", lambda *a, **k: _FakeGeminiResponse(500, {}))

    client = TestClient(app)
    response = client.post("/api/assistant/chat", json={"message": "hi", "session_id": "session-500"})

    assert response.status_code == 200
    assert response.json()["reply"] == gemini_service.UNAVAILABLE_MESSAGE


def test_assistant_chat_returns_graceful_fallback_on_malformed_response(monkeypatch: pytest.MonkeyPatch):
    _configure_gemini(monkeypatch, api_key="test-key")
    monkeypatch.setattr(site_service, "list_recommended_sites", _fake_recommended_sites)
    monkeypatch.setattr(gemini_service.requests, "post", lambda *a, **k: _FakeGeminiResponse(200, {"unexpected": "shape"}))

    client = TestClient(app)
    response = client.post("/api/assistant/chat", json={"message": "hi", "session_id": "session-malformed"})

    assert response.status_code == 200
    assert response.json()["reply"] == gemini_service.UNAVAILABLE_MESSAGE


def test_assistant_chat_not_configured_short_circuits_without_network_call(monkeypatch: pytest.MonkeyPatch):
    _configure_gemini(monkeypatch, api_key="")

    def fail_if_called(*args, **kwargs):
        raise AssertionError("requests.post must not be called when Gemini isn't configured")

    monkeypatch.setattr(gemini_service.requests, "post", fail_if_called)

    client = TestClient(app)
    response = client.post("/api/assistant/chat", json={"message": "hi", "session_id": "session-none"})

    assert response.status_code == 200
    assert response.json()["reply"] == gemini_service.NOT_CONFIGURED_MESSAGE
