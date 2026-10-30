"""Telemetry Service Abstraction.

Structures vehicle telemetry data ingestion for future connected-car APIs,
OBD-II Bluetooth dongles, or manufacturer telematics.
Currently uses manual driver input as the source of truth for MVP.
"""

from typing import Any, Protocol


class TelemetryProvider(Protocol):
    def get_latest_telemetry(self, vehicle_id: str) -> dict[str, Any]:
        ...


class ManualTelemetryProvider:
    """MVP Provider using manual user updates stored in PostgreSQL."""

    def get_latest_telemetry(self, vehicle_id: str, current_battery_pct: float) -> dict[str, Any]:
        return {
            "source": "MANUAL_INPUT",
            "vehicle_id": vehicle_id,
            "current_battery_pct": current_battery_pct,
            "state_of_health_pct": 100.0,
            "charging_status": "DISCONNECTED",
            "location_gps": None,
        }
