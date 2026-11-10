"""OTP hashing, JWT sessions and role-based access guards."""
import hashlib
import hmac
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from . import config
from .database import get_db
from .models import AuthSession, Role, User

bearer = HTTPBearer(auto_error=False)
PHONE_RE = re.compile(r"^\+?[0-9]{10,13}$")


def normalise_phone(raw: str) -> str:
    """Return E.164. 10-digit numbers are assumed to be Indian (+91)."""
    digits = re.sub(r"[\s\-()]", "", raw or "")
    if not PHONE_RE.match(digits):
        raise HTTPException(422, "Enter a valid mobile number, e.g. 98765 43210.")
    if digits.startswith("+"):
        return digits
    if len(digits) == 10:
        return "+91" + digits
    if digits.startswith("91") and len(digits) == 12:
        return "+" + digits
    return "+" + digits


def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(phone: str, code: str) -> str:
    return hmac.new(config.JWT_SECRET.encode(), f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


def verify_otp_hash(phone: str, code: str, stored: str) -> bool:
    return hmac.compare_digest(hash_otp(phone, code), stored)


def issue_token(db: Session, user: User) -> tuple[str, datetime]:
    jti = str(uuid.uuid4())
    exp = datetime.now(timezone.utc) + timedelta(hours=config.JWT_EXPIRE_HOURS)
    db.add(AuthSession(id=jti, user_id=user.id, expires_at=exp))
    db.commit()
    token = jwt.encode({"sub": user.id, "role": user.role.value, "jti": jti, "exp": exp},
                       config.JWT_SECRET, algorithm="HS256")
    return token, exp


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer),
                 db: Session = Depends(get_db)) -> User:
    if not creds:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to continue.")
    try:
        payload = jwt.decode(creds.credentials, config.JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has expired. Sign in again.")
    session = db.get(AuthSession, payload.get("jti"))
    if not session or session.revoked:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "You have been signed out. Sign in again.")
    user = db.get(User, payload["sub"])
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This account is not active.")
    return user


def require_role(*roles: Role):
    """Dependency factory. Server-side enforcement: the frontend hiding a menu is never the control."""
    def guard(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Your account cannot open this area.")
        return user
    return guard


def revoke_session(db: Session, token: str) -> None:
    try:
        payload = jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"], options={"verify_exp": False})
    except jwt.PyJWTError:
        return
    session = db.get(AuthSession, payload.get("jti"))
    if session:
        session.revoked = True
        db.commit()
