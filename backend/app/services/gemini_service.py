"""Gemini-backed "Ask about these sites" planner assistant.

Design rules:
  - Gemini NEVER computes a score, a verdict, or a factor itself. It receives
    already-computed data from site_service.list_recommended_sites as read-only
    context and answers user questions about that data.
  - Planner-side text chatbot only. Context is built purely from public site data.
  - Read GEMINI_API_KEY from backend settings/environment, never exposed frontend.
  - Never raises: all errors are logged and turned into human-readable strings.
"""

from __future__ import annotations

import logging
import requests
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.services import site_service

logger = logging.getLogger(__name__)

GEMINI_MODELS = ["gemini-3.5-flash", "gemini-3.6-flash", "gemini-2.5-flash"]
GEMINI_TIMEOUT_SECONDS = 30

NOT_CONFIGURED_MESSAGE = "The site assistant isn't configured yet -- ask an admin to set GEMINI_API_KEY."
UNAVAILABLE_MESSAGE = "The assistant is unavailable right now — please try again in a moment."

CONTEXT_LIMIT = 10


def build_site_context(db: Session) -> str:
    """Format ranked-site data into the assistant's context block."""
    sites = site_service.list_recommended_sites(db, limit=CONTEXT_LIMIT)
    if not sites:
        return "No candidate sites are currently scored."

    lines = ["Ranked EV charging candidate sites in Bengaluru (already scored, do not recompute):"]
    for site in sites:
        lines.append(
            f"#{site.rank} {site.name} -- score {site.site_score:.1f}/100, "
            f"recommendation {site.recommendation.value if hasattr(site.recommendation, 'value') else site.recommendation}. "
            f"{site.explanation or 'No explanation available.'}"
        )
    return "\n".join(lines)


def ask_assistant(db: Session, message: str, session_id: str) -> str:
    settings = get_settings()
    api_key = settings.GEMINI_API_KEY.strip()
    if not api_key:
        logger.warning("Planner assistant not configured: GEMINI_API_KEY is missing")
        return NOT_CONFIGURED_MESSAGE

    context = build_site_context(db)
    system_prompt = (
        "You are VidyutOne Site Assistant, a professional EV mobility & grid infrastructure planning AI. "
        "Your role is to help DISCOM/municipal planners analyze candidate sites, scores, demand projections, and grid suitability. "
        "Answer concisely, professionally, and clearly. Use the provided site context data as your single source of truth. "
        "Do NOT recompute scores or invent un-scored sites.\n\n"
        f"Site Context Data:\n{context}"
    )

    payload = {
        "system_instruction": {
            "parts": [{"text": system_prompt}]
        },
        "contents": [
            {
                "parts": [{"text": message}]
            }
        ]
    }

    for model in GEMINI_MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        try:
            logger.info("Planner assistant: querying Gemini model=%s", model)
            response = requests.post(url, json=payload, timeout=GEMINI_TIMEOUT_SECONDS)
            if response.status_code == 200:
                body = response.json()
                candidates = body.get("candidates") or []
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts") or []
                    if parts and isinstance(parts[0].get("text"), str):
                        reply = parts[0]["text"].strip()
                        if reply:
                            return reply
            logger.warning("Planner assistant model %s returned status=%s", model, response.status_code)
        except Exception as exc:
            logger.warning("Planner assistant model %s request failed: %s", model, exc)

    logger.error("All Gemini model attempts failed for planner assistant")
    return UNAVAILABLE_MESSAGE
