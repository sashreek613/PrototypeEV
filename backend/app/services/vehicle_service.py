from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.vehicle import Vehicle
from app.schemas.vehicle import RangeEstimate, VehicleCreate, VehicleUpdate


def list_user_vehicles(db: Session, user_id: str) -> list[Vehicle]:
    stmt = select(Vehicle).where(Vehicle.user_id == user_id).order_by(Vehicle.is_primary.desc(), Vehicle.created_at.desc())
    return list(db.scalars(stmt).all())


def get_primary_vehicle(db: Session, user_id: str) -> Vehicle | None:
    vehicles = list_user_vehicles(db, user_id)
    if not vehicles:
        return None
    return next((item for item in vehicles if item.is_primary), vehicles[0])


def get_vehicle_by_id(db: Session, vehicle_id: str, user_id: str) -> Vehicle | None:
    stmt = select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.user_id == user_id)
    return db.scalar(stmt)


def create_user_vehicle(db: Session, user_id: str, payload: VehicleCreate) -> Vehicle:
    # If set as primary, unset other primaries for this user
    if payload.is_primary:
        existing = db.scalars(select(Vehicle).where(Vehicle.user_id == user_id, Vehicle.is_primary.is_(True))).all()
        for v in existing:
            v.is_primary = False

    vehicle = Vehicle(
        id=f"veh-{uuid4().hex[:12]}",
        user_id=user_id,
        make=payload.make,
        model=payload.model,
        battery_capacity_kwh=payload.battery_capacity_kwh,
        current_battery_pct=payload.current_battery_pct,
        efficiency_wh_km=payload.efficiency_wh_km,
        is_primary=payload.is_primary,
        registration_date=payload.registration_date,
    )
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle


def update_user_vehicle(db: Session, vehicle_id: str, user_id: str, payload: VehicleUpdate) -> Vehicle:
    vehicle = get_vehicle_by_id(db, vehicle_id, user_id)
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")

    if payload.is_primary is True:
        existing = db.scalars(select(Vehicle).where(Vehicle.user_id == user_id, Vehicle.is_primary.is_(True))).all()
        for v in existing:
            v.is_primary = False

    update_data = payload.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(vehicle, field, val)

    db.commit()
    db.refresh(vehicle)
    return vehicle


def delete_user_vehicle(db: Session, vehicle_id: str, user_id: str) -> None:
    vehicle = get_vehicle_by_id(db, vehicle_id, user_id)
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")

    db.delete(vehicle)
    db.commit()
