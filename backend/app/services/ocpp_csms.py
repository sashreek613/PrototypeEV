"""OCPP 2.0.1 CSMS handlers.

Charge-point StatusNotification / TransactionEvent / BootNotification /
Heartbeat are translated into physical_status via physical_status_service.
Simulator HTTP updates must never call this module — they call apply_status
with source=SIMULATOR instead.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from ocpp.routing import on
from ocpp.v201 import ChargePoint as ChargePoint201
from ocpp.v201 import call_result
from ocpp.v201.enums import RegistrationStatusEnumType

from app.database.session import SessionLocal
from app.engines.occupancy import (
    PHYSICAL_AVAILABLE,
    PHYSICAL_CHARGING,
    PHYSICAL_FINISHING,
    PHYSICAL_PREPARING,
    PHYSICAL_SUSPENDED,
    SOURCE_OCPP,
    map_ocpp_connector_status,
)
from app.services.physical_status_service import apply_status_by_identity

logger = logging.getLogger(__name__)


def _enum_value(value: object | None) -> str:
    raw = getattr(value, "value", value)
    return str(raw or "").strip()


def persist_ocpp_status(identity: str, physical_status: str) -> None:
    db = SessionLocal()
    try:
        apply_status_by_identity(
            db,
            identity=identity,
            physical_status=physical_status,
            source=SOURCE_OCPP,
        )
    except Exception:
        logger.exception("OCPP status persist failed for identity=%s", identity)
    finally:
        db.close()


class CentralSystemChargePoint(ChargePoint201):
    @on("BootNotification")
    async def on_boot_notification(self, charging_station, reason, **kwargs):
        return call_result.BootNotification(
            current_time=datetime.now(timezone.utc).isoformat(),
            interval=60,
            status=RegistrationStatusEnumType.accepted,
        )

    @on("Heartbeat")
    async def on_heartbeat(self, **kwargs):
        return call_result.Heartbeat(current_time=datetime.now(timezone.utc).isoformat())

    @on("StatusNotification")
    async def on_status_notification(self, timestamp, connector_status, evse_id, connector_id, **kwargs):
        persist_ocpp_status(self.id, map_ocpp_connector_status(connector_status))
        return call_result.StatusNotification()

    @on("TransactionEvent")
    async def on_transaction_event(
        self,
        event_type,
        timestamp,
        trigger_reason,
        seq_no,
        transaction_info,
        **kwargs,
    ):
        event = _enum_value(event_type).lower()
        info = transaction_info if isinstance(transaction_info, dict) else {}
        charging_state = _enum_value(
            info.get("charging_state") if isinstance(info, dict) else getattr(transaction_info, "charging_state", None)
        ).lower()
        if event == "ended":
            persist_ocpp_status(self.id, PHYSICAL_AVAILABLE)
        elif charging_state == "charging":
            persist_ocpp_status(self.id, PHYSICAL_CHARGING)
        elif charging_state in {"suspendedev", "suspendedevse"}:
            persist_ocpp_status(self.id, PHYSICAL_SUSPENDED)
        elif charging_state == "evconnected":
            persist_ocpp_status(self.id, PHYSICAL_PREPARING)
        elif charging_state == "idle":
            persist_ocpp_status(self.id, PHYSICAL_FINISHING)
        return call_result.TransactionEvent()
