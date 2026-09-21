from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, Request, status

from app.core.security import decode_access_token


@dataclass
class CurrentUser:
    """Mirrors req.user = decoded.UserInfo from verifyJWT.js — trusts the
    access token's claims directly rather than re-fetching from the DB on
    every request, same as the source."""

    id: int
    name: str
    role: str
    institution: str | None
    department: str | None


def get_current_user(request: Request) -> CurrentUser:
    """Authenticates the bearer access token.

    A missing, malformed, or expired token is an *authentication* failure and
    raises 401. 403 is reserved for authenticated callers who lack
    permission, so the client can tell "refresh my token" apart from "you
    may not do this" — same split as verifyJWT.js.
    """
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    token = auth_header.split(" ", 1)[1]
    try:
        decoded = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    info = decoded.get("UserInfo") or {}
    return CurrentUser(
        id=info.get("id"),
        name=info.get("name"),
        role=info.get("role"),
        institution=info.get("institution"),
        department=info.get("department"),
    )


def require_roles(*allowed: str):
    """Route dependency: allow only the given roles. Port of verifyRoles.js's
    authorizeRoles(...allowed)."""

    def _dependency(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if not current_user.role or current_user.role not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return current_user

    return _dependency
