from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import config
from ..database import get_db
from ..models import CommuterProfile, DriverProfile, OtpCode, Role, User
from ..schemas import LoginIn, OtpRequest, RegisterIn
from ..security import (bearer, current_user, generate_otp, hash_otp, issue_token, normalise_phone,
                        revoke_session, verify_otp_hash)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def user_dto(u: User) -> dict:
    return {"id": u.id, "full_name": u.full_name, "phone": u.phone, "email": u.email, "role": u.role.value,
            "onboarding_complete": u.onboarding_complete, "is_demo": u.is_demo}


@router.post("/request-otp")
def request_otp(body: OtpRequest, db: Session = Depends(get_db)):
    phone = normalise_phone(body.phone)
    exists = db.scalar(select(User.id).where(User.phone == phone)) is not None
    if body.purpose == "register" and exists:
        raise HTTPException(409, "This number already has an account. Sign in instead.")
    if body.purpose == "login" and not exists:
        raise HTTPException(404, "No account found for this number. Create one first.")
    window = datetime.now(timezone.utc) - timedelta(minutes=10)
    recent = db.scalar(select(func.count(OtpCode.id)).where(OtpCode.phone == phone, OtpCode.created_at > window))
    if recent >= 5:
        raise HTTPException(429, "Too many codes requested. Wait a few minutes and try again.")
    code = generate_otp()
    db.add(OtpCode(phone=phone, code_hash=hash_otp(phone, code), purpose=body.purpose,
                   expires_at=datetime.now(timezone.utc) + timedelta(minutes=config.OTP_TTL_MINUTES)))
    db.commit()
    resp = {"sent": True, "phone": phone, "expires_in_seconds": config.OTP_TTL_MINUTES * 60,
            "test_mode": config.OTP_TEST_MODE}
    if config.OTP_TEST_MODE:
        # TEST MODE ONLY: no SMS provider is configured, so the code is returned here. Clearly labelled in the UI.
        resp["test_otp"] = code
        resp["notice"] = "TEST OTP: no SMS provider is configured. This code is shown only in test mode."
    # Real mode: hand `code` to the SMS provider here. It is never returned.
    return resp


def _consume_otp(db: Session, phone: str, code: str, purpose: str) -> None:
    otp = db.scalar(select(OtpCode).where(OtpCode.phone == phone, OtpCode.purpose == purpose,
                                          OtpCode.consumed.is_(False)).order_by(OtpCode.created_at.desc()))
    if not otp:
        raise HTTPException(400, "Request a new code first.")
    expires = otp.expires_at if otp.expires_at.tzinfo else otp.expires_at.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(400, "This code has expired. Request a new one.")
    if otp.attempts >= config.OTP_MAX_ATTEMPTS:
        raise HTTPException(429, "Too many wrong attempts. Request a new code.")
    otp.attempts += 1
    if not verify_otp_hash(phone, code, otp.code_hash):
        db.commit()
        raise HTTPException(400, "That code is not correct.")
    otp.consumed = True


@router.post("/register")
def register(body: RegisterIn, db: Session = Depends(get_db)):
    phone = normalise_phone(body.phone)
    if db.scalar(select(User.id).where(User.phone == phone)):
        raise HTTPException(409, "This number already has an account. Sign in instead.")
    if body.email and db.scalar(select(User.id).where(User.email == body.email)):
        raise HTTPException(409, "This email is already used by another account.")
    _consume_otp(db, phone, body.otp, "register")
    role = Role(body.role)
    user = User(phone=phone, email=body.email, full_name=body.full_name.strip(), role=role, phone_verified=True,
                last_login_at=datetime.now(timezone.utc))
    db.add(user)
    db.flush()
    if role == Role.commuter:
        db.add(CommuterProfile(user_id=user.id))
    else:
        db.add(DriverProfile(user_id=user.id))
    db.commit()
    token, exp = issue_token(db, user)
    return {"token": token, "expires_at": exp.isoformat(), "user": user_dto(user)}


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    phone = normalise_phone(body.phone)
    user = db.scalar(select(User).where(User.phone == phone))
    if not user:
        raise HTTPException(404, "No account found for this number. Create one first.")
    if not user.is_active:
        raise HTTPException(403, "This account is suspended. Contact support.")
    _consume_otp(db, phone, body.otp, "login")
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    token, exp = issue_token(db, user)
    return {"token": token, "expires_at": exp.isoformat(), "user": user_dto(user)}


@router.post("/logout")
def logout(creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db),
           _: User = Depends(current_user)):
    revoke_session(db, creds.credentials)
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_dto(user)
