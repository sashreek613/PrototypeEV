from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.session import get_db
from app.schemas.auth import AuthUser
from app.schemas.vehicle import RangeEstimate, VehicleCreate, VehicleRead, VehicleUpdate
from app.services import vehicle_service
from app.services.range_service import calculate_range


class DrivingProfileParam(str, Enum):
    CITY = "city"
    MIXED = "mixed"
    HIGHWAY = "highway"

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


@router.get("", response_model=list[VehicleRead])
def get_vehicles(
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
) -> list[VehicleRead]:
    return vehicle_service.list_user_vehicles(db, current_user.id)


@router.post("", response_model=VehicleRead, status_code=status.HTTP_201_CREATED)
def create_vehicle(
    payload: VehicleCreate,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
) -> VehicleRead:
    return vehicle_service.create_user_vehicle(db, current_user.id, payload)


@router.patch("/{vehicle_id}", response_model=VehicleRead)
def update_vehicle(
    vehicle_id: str,
    payload: VehicleUpdate,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
) -> VehicleRead:
    return vehicle_service.update_user_vehicle(db, vehicle_id, current_user.id, payload)


@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehicle(
    vehicle_id: str,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
) -> None:
    vehicle_service.delete_user_vehicle(db, vehicle_id, current_user.id)


@router.get("/{vehicle_id}/range", response_model=RangeEstimate)
def get_vehicle_range(
    vehicle_id: str,
    # All optional, all default to a no-op adjustment (multiplier 1.0) --
    # an old caller that never passes any of these gets exactly today's
    # numbers. lat/lon are the DRIVER's current location (not the
    # vehicle's -- vehicles have no stored location), used only to look up
    # ambient temperature; omit either one to skip the temperature
    # adjustment entirely.
    lat: float | None = Query(None, ge=-90, le=90),
    lon: float | None = Query(None, ge=-180, le=180),
    climate_control: bool = Query(False),
    driving_profile: DrivingProfileParam = Query(DrivingProfileParam.MIXED),
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
) -> RangeEstimate:
    vehicle = vehicle_service.get_vehicle_by_id(db, vehicle_id, current_user.id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return calculate_range(
        battery_capacity_kwh=vehicle.battery_capacity_kwh,
        current_battery_pct=vehicle.current_battery_pct,
        efficiency_wh_km=vehicle.efficiency_wh_km,
        latitude=lat,
        longitude=lon,
        climate_control=climate_control,
        driving_profile=driving_profile.value,
        registration_date=vehicle.registration_date,
    )
