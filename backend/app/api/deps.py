from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import InvalidAccessToken, unauthorized_from_token_error, verify_supabase_jwt
from app.database.session import get_db
from app.models.user import ROLE_ADMIN, ROLE_DRIVER, ROLE_OPERATOR, ROLE_PLANNER
from app.schemas.auth import AuthUser
from app.services import user_service
from app.services.operator_demo_store import DEMO_OPERATOR_TOKEN, demo_auth_user

bearer_scheme = HTTPBearer(auto_error=False)


def _missing_bearer() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid session",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> AuthUser:
    if creds is None or creds.scheme.lower() != "bearer" or not creds.credentials:
        raise _missing_bearer()

    if creds.credentials == DEMO_OPERATOR_TOKEN:
        return demo_auth_user()

    try:
        claims = verify_supabase_jwt(creds.credentials)
    except InvalidAccessToken as exc:
        raise unauthorized_from_token_error() from exc

    email = claims.get("email")
    if not isinstance(email, str) or not email:
        metadata = claims.get("user_metadata")
        if isinstance(metadata, dict):
            raw_email = metadata.get("email")
            email = raw_email if isinstance(raw_email, str) else None
    user_id = claims.get("sub")
    if not isinstance(email, str) or not email or not isinstance(user_id, str) or not user_id:
        raise unauthorized_from_token_error()

    profile = user_service.get_or_create_profile(
        db,
        user_id=user_id,
        email=email,
        metadata=claims.get("user_metadata"),
    )
    return AuthUser(
        id=profile.id,
        email=profile.email,
        full_name=profile.full_name,
        role=profile.role,
        is_verified=profile.is_verified,
        is_active=profile.is_active,
        verification_status=profile.verification_status,
    )


def require_planner(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if user.role != ROLE_PLANNER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if not (
        user.is_verified
        and user.is_active
        and user.verification_status == "approved"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Planner account is pending verification by an administrator.",
        )
    return user


def require_driver(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if user.role != ROLE_DRIVER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return user


def require_admin(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if user.role != ROLE_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return user


def require_operator(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if user.role != ROLE_OPERATOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return user

