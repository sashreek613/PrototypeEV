"""Lyzr-backed "Ask about these sites" planner assistant.

Design rules (see the task this was built against for the full rationale):
  - Lyzr NEVER computes a score, a verdict, or a factor. It only receives
    already-computed data from app/engines/site_scoring.py (via
    site_service.list_recommended_sites) as read-only context and answers
    questions about it. The system prompt (configured in Lyzr Studio, not
    here) is what tells the agent to refuse recalculation requests -- this
    file's only job is to hand it real numbers, never fabricate one itself.
  - Planner-side only, and the context is built purely from data that's
    already public within the app (ranked sites, scores, factors,
    explanations) -- no user PII, no auth tokens, ever included.
  - This is the one place in the backend allowed to make a live external
    network call at request time (everything else is offline-first). Every
    failure mode is caught here and turned into a friendly in-panel string;
    this function must never raise.
"""

from __future__ import annotations

import logging

import requests
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.services import site_service

logger = logging.getLogger(__name__)

LYZR_CHAT_URL = "https://agent-prod.studio.lyzr.ai/v3/inference/chat/"
LYZR_TIMEOUT_SECONDS = 10

# Required by Lyzr's /v3/inference/chat/ request shape, but this assistant is
# an anonymous, planner-side bolt-on with no per-user identity of its own
# (see is_within_bbox/list_recommended_sites -- unauthenticated, like the
# dashboard data it reads). A fixed, non-PII app identifier satisfies the
# required field without ever sending a real user id.
LYZR_USER_ID = "vidyutone-planner-dashboard"

NOT_CONFIGURED_MESSAGE = "The site assistant isn't configured yet -- ask an admin to set LYZR_API_KEY and LYZR_AGENT_ID."
UNAVAILABLE_MESSAGE = "The assistant is unavailable right now — please try again in a moment."

CONTEXT_LIMIT = 10


def build_site_context(db: Session) -> str:
    """The ONE place that formats ranked-site data into the assistant's
    context block -- don't duplicate this formatting elsewhere. Reuses
    RecommendedSiteRead.explanation (already a one-line, place-naming summary
    built by site_scoring._build_explanation) rather than re-deriving factor
    text, so this never drifts from what the dashboard itself says."""
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
    api_key_ok = bool(settings.LYZR_API_KEY)
    agent_id_ok = bool(settings.LYZR_AGENT_ID)
    logger.info(
        "Planner assistant request: LYZR_API_KEY configured=%s, LYZR_AGENT_ID configured=%s",
        api_key_ok,
        agent_id_ok,
    )
    if not api_key_ok or not agent_id_ok:
        logger.warning(
            "Planner assistant not configured: LYZR_API_KEY=%s LYZR_AGENT_ID=%s",
            "set" if api_key_ok else "MISSING",
            "set" if agent_id_ok else "MISSING",
        )
        return NOT_CONFIGURED_MESSAGE

    try:
        context = build_site_context(db)
        payload = {
            "user_id": LYZR_USER_ID,
            "agent_id": settings.LYZR_AGENT_ID,
            "session_id": session_id,
            "message": message,
            "system_prompt_variables": {"site_context": context},
            "filter_variables": {},
        }
        logger.info("Planner assistant: sending request to Lyzr (agent_id configured)")
        response = requests.post(
            LYZR_CHAT_URL,
            headers={"Content-Type": "application/json", "x-api-key": settings.LYZR_API_KEY},
            json=payload,
            timeout=LYZR_TIMEOUT_SECONDS,
        )
        logger.info("Planner assistant: Lyzr HTTP status=%s", response.status_code)
        response.raise_for_status()
        body = response.json()
        reply = body.get("response")
        if not isinstance(reply, str) or not reply.strip():
            logger.warning("Planner assistant: Lyzr response missing non-empty 'response' field; keys=%s", list(body.keys()))
            raise ValueError("Lyzr response missing a non-empty 'response' field")
        return reply
    except Exception:  # noqa: BLE001 -- this call must never raise out to the route
        logger.exception("Lyzr planner assistant call failed")
        return UNAVAILABLE_MESSAGE

