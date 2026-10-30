"""OCPP 2.0.1 WebSocket CSMS endpoint.

Charge points connect to /api/ocpp/{charge_point_id}. The id is matched to
chargers.ocpp_identity or chargers.id. Optional OCPP_AUTH_KEY is never sent
to the React app.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

from app.core.config import get_settings
from app.services.ocpp_csms import CentralSystemChargePoint

logger = logging.getLogger(__name__)

router = APIRouter()
OCPP_SUBPROTOCOL = "ocpp2.0.1"


class FastAPIWebSocketAdapter:
    def __init__(self, websocket: WebSocket) -> None:
        self._websocket = websocket

    async def recv(self) -> str:
        return await self._websocket.receive_text()

    async def send(self, message: str) -> None:
        await self._websocket.send_text(message)


def _authorized(websocket: WebSocket, key: str | None) -> bool:
    settings = get_settings()
    expected = (settings.OCPP_AUTH_KEY or "").strip()
    if not expected:
        return True
    header = websocket.headers.get("authorization") or websocket.headers.get("x-ocpp-key") or ""
    token = key or ""
    if header.lower().startswith("bearer "):
        token = header[7:].strip()
    elif header:
        token = header.strip()
    return token == expected


@router.websocket("/api/ocpp/{charge_point_id}")
async def ocpp_charge_point(
    websocket: WebSocket,
    charge_point_id: str,
    key: str | None = Query(default=None),
) -> None:
    if not _authorized(websocket, key):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    requested = websocket.headers.get("sec-websocket-protocol", "")
    subprotocol = OCPP_SUBPROTOCOL if OCPP_SUBPROTOCOL in requested else None
    await websocket.accept(subprotocol=subprotocol)
    charge_point = CentralSystemChargePoint(charge_point_id, FastAPIWebSocketAdapter(websocket))
    try:
        await charge_point.start()
    except WebSocketDisconnect:
        logger.info("OCPP charge point disconnected: %s", charge_point_id)
    except Exception:
        logger.exception("OCPP session ended for %s", charge_point_id)
