"""Lyzr-backed driver-side voice-assistant fallback.

Mirrors app/services/lyzr_service.py's structure and error-handling exactly,
for a second, driver-scoped Lyzr agent (LYZR_DRIVER_AGENT_ID, same
LYZR_API_KEY). The two differences from the planner version:

  - No DB session: the planner version builds its own context from
    site_service; this one receives an already-built context_summary in the
    request, computed by DriverHomePage.tsx's existing useMemo chain (the
    `recommended` list + bufferedRangeKm). This function never recomputes or
    fetches charger/range data -- see schemas/driver_assistant.py.
  - This is the FALLBACK path only: DriverHomePage's voice input first tries
    to match a transcript against the small fixed command vocabulary in
    frontend/src/utils/voiceCommands.ts (search/clear/sort/range), which
    execute deterministically with zero network calls. Only an unmatched
    transcript reaches this function.

Same as the planner version: this is the one place in this half of the
backend allowed to make a live external network call at request time, wraps
it in a short timeout, and never raises -- every failure mode degrades to a
friendly in-panel string.
"""

from __future__ import annotations

import logging

import requests

from app.core.config import get_settings
from app.services.lyzr_service import LYZR_CHAT_URL, LYZR_TIMEOUT_SECONDS, UNAVAILABLE_MESSAGE

logger = logging.getLogger(__name__)

# Same non-PII rationale as lyzr_service.LYZR_USER_ID: a fixed app
# identifier, never a real user id, since this endpoint carries no auth
# identity of its own into the Lyzr payload.
LYZR_DRIVER_USER_ID = "vidyutone-driver-voice-assistant"

NOT_CONFIGURED_MESSAGE = "The voice assistant isn't configured yet -- ask an admin to set LYZR_API_KEY and LYZR_DRIVER_AGENT_ID."


def ask_driver_assistant(message: str, session_id: str, context_summary: str) -> str:
    # TEMP DEBUG (per investigation into wrong/context-less Lyzr replies) --
    # logger.warning, not .info, so it shows up under the default logging
    # config with no extra setup. Leave in until confirmed working end to
    # end, then remove.
    logger.warning("[voice-assistant debug] context_summary received from frontend: %r", context_summary)

    settings = get_settings()
    if not settings.LYZR_API_KEY or not settings.LYZR_DRIVER_AGENT_ID:
        return NOT_CONFIGURED_MESSAGE

    try:
        payload = {
            "user_id": LYZR_DRIVER_USER_ID,
            "agent_id": settings.LYZR_DRIVER_AGENT_ID,
            "session_id": session_id,
            "message": message,
            "system_prompt_variables": {"driver_context": context_summary},
            "filter_variables": {},
        }
        logger.warning("[voice-assistant debug] system_prompt_variables sent to Lyzr: %r", payload["system_prompt_variables"])
        response = requests.post(
            LYZR_CHAT_URL,
            headers={"Content-Type": "application/json", "x-api-key": settings.LYZR_API_KEY},
            json=payload,
            timeout=LYZR_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        body = response.json()
        reply = body.get("response")
        if not isinstance(reply, str) or not reply.strip():
            raise ValueError("Lyzr response missing a non-empty 'response' field")
        return reply
    except Exception:  # noqa: BLE001 -- this call must never raise out to the route
        logger.exception("Lyzr driver assistant call failed")
        return UNAVAILABLE_MESSAGE
