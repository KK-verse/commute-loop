from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import config
from ..database import get_db
from ..models import (CommuteRequest, DriverDocument, DriverProfile, MatchGroup, MatchStatus, RequestStatus, Role,
                      SafetyIncident, TripInstance, TripStatus, User, Vehicle, Verification)
from ..schemas import VerificationDecision
from ..security import require_role
from ..services import audit, notify

router = APIRouter(prefix="/api/admin", tags=["admin"])
admin_only = require_role(Role.admin)


def _split(db: Session, model, *conds, demo_col=None) -> dict:
    """Return {total, real, demo}. Demo records are counted separately so simulated data is never passed off as real."""
    col = demo_col if demo_col is not None else model.is_demo
    q = select(func.count()).select_from(model).where(*conds)
    total = db.scalar(q)
    demo = db.scalar(q.where(col.is_(True)))
    return {"total": total, "real": total - demo, "demo": demo}


@router.get("/overview")
def overview(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    cancelled = (TripStatus.cancelled, TripStatus.skipped)
    unassigned = (TripStatus.no_match, TripStatus.reassignment_pending)
    drivers_q = select(func.count()).select_from(DriverProfile).join(User, User.id == DriverProfile.user_id)
    pending_drivers = db.scalar(drivers_q.where(DriverProfile.verification_status == Verification.pending,
                                                User.onboarding_complete.is_(True)))
    pending_demo = db.scalar(drivers_q.where(DriverProfile.verification_status == Verification.pending,
                                             User.onboarding_complete.is_(True), User.is_demo.is_(True)))
    return {
        "demo_mode": config.DEMO_MODE,
        "metrics": {
            "total_commuters": _split(db, User, User.role == Role.commuter),
            "registered_drivers": _split(db, User, User.role == Role.driver),
            "pending_driver_verifications": {"total": pending_drivers, "real": pending_drivers - pending_demo,
                                             "demo": pending_demo},
            "active_commute_requests": _split(db, CommuteRequest, CommuteRequest.status == RequestStatus.active),
            "proposed_matches": _split(db, MatchGroup, MatchGroup.status == MatchStatus.proposed),
            "confirmed_trips": _split(db, TripInstance, TripInstance.status.in_(
                (TripStatus.confirmed, TripStatus.in_progress, TripStatus.completed))),
            "cancelled_trips": _split(db, TripInstance, TripInstance.status.in_(cancelled)),
            "unassigned_trips": _split(db, TripInstance, TripInstance.status.in_(unassigned)),
        },
        "open_incidents": db.scalar(select(func.count()).select_from(SafetyIncident)
                                    .where(SafetyIncident.status != "resolved")),
        "sources": {"metrics": "users, driver_profiles, commute_requests, match_groups, trip_instances"},
    }


@router.get("/commuters")
def commuters(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    rows = db.scalars(select(User).where(User.role == Role.commuter).order_by(User.created_at.desc())).all()
    return [{"id": u.id, "name": u.full_name, "phone": u.phone, "email": u.email,
             "company": u.commuter_profile.company_name if u.commuter_profile else None,
             "city": u.commuter_profile.city if u.commuter_profile else None,
             "onboarded": u.onboarding_complete, "is_demo": u.is_demo,
             "joined": u.created_at.isoformat()} for u in rows]


def _driver_row(db: Session, u: User) -> dict:
    p = u.driver_profile
    v = db.scalar(select(Vehicle).where(Vehicle.driver_id == p.id))
    docs = db.scalars(select(DriverDocument).where(DriverDocument.driver_id == p.id)).all()
    return {"id": p.id, "user_id": u.id, "name": u.full_name, "phone": u.phone, "city": p.city,
            "licence_number": p.licence_number, "status": p.verification_status.value, "note": p.verification_note,
            "is_demo": u.is_demo, "onboarded": u.onboarding_complete,
            "vehicle": None if not v else {
                "registration": v.registration_number, "category": v.category.value, "model": v.model,
                "capacity": v.permitted_passenger_capacity, "insurance_provider": v.insurance_provider,
                "insurance_expiry": v.insurance_expiry.isoformat() if v.insurance_expiry else None,
                "permit_number": v.permit_number, "eligibility": v.eligibility_status.value},
            "documents": [{"type": d.doc_type, "filename": d.original_filename, "status": d.status.value}
                          for d in docs]}


@router.get("/drivers")
def drivers(status: str | None = None, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    q = select(User).join(DriverProfile, DriverProfile.user_id == User.id).where(User.role == Role.driver)
    if status:
        q = q.where(DriverProfile.verification_status == Verification(status))
    return [_driver_row(db, u) for u in db.scalars(q.order_by(User.created_at.desc())).all()]


@router.post("/drivers/{driver_id}/verification")
def decide(driver_id: str, body: VerificationDecision, admin: User = Depends(admin_only),
           db: Session = Depends(get_db)):
    p = db.get(DriverProfile, driver_id)
    if not p:
        raise HTTPException(404, "Driver not found.")
    veh = db.scalar(select(Vehicle).where(Vehicle.driver_id == p.id))
    if body.decision == "approved":
        if not veh or not p.licence_number:
            raise HTTPException(409, "Licence and vehicle details must be submitted before approval.")
        if body.note is None and not p.user.onboarding_complete:
            raise HTTPException(409, "The driver has not finished onboarding.")
    if body.decision in ("rejected", "suspended") and not (body.note or "").strip():
        raise HTTPException(422, "Add a reason so the driver knows what to fix.")
    prev = p.verification_status.value
    p.verification_status = Verification(body.decision)
    p.verification_note = body.note
    p.verified_at = datetime.now(timezone.utc) if body.decision == "approved" else None
    if veh:
        veh.eligibility_status = Verification(body.decision)
    for d in db.scalars(select(DriverDocument).where(DriverDocument.driver_id == p.id)):
        d.status = Verification(body.decision) if body.decision != "pending" else Verification.pending
    audit(db, admin.id, f"driver_{body.decision}", "driver_profile", p.id, {"from": prev, "note": body.note})
    msg = {"approved": "You're approved. You can now receive recurring commute assignments.",
           "rejected": f"Your application needs changes: {body.note}",
           "suspended": f"Your account is suspended: {body.note}", "pending": "Your application is back in review."}
    notify(db, p.user_id, "Driver verification update", msg[body.decision], "verification")
    db.commit()
    return _driver_row(db, p.user)


@router.get("/commute-requests")
def commute_requests(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    from ..models import SavedLocation
    out = []
    for r in db.scalars(select(CommuteRequest).order_by(CommuteRequest.created_at.desc()).limit(200)):
        u, home, office = db.get(User, r.commuter_id), db.get(SavedLocation, r.home_location_id), \
            db.get(SavedLocation, r.office_location_id)
        out.append({"id": r.id, "created_at": r.created_at.isoformat(), "commuter": u.full_name,
                    "home": home.label, "home_address": home.address,
                    "office": office.label, "office_address": office.address,
                    "arrival_deadline": r.arrival_deadline.strftime("%H:%M"),
                    "evening": r.evening_departure_time.strftime("%H:%M") if r.evening_departure_time else None,
                    "days": r.travel_days, "vehicle": r.preferred_vehicle, "max_extra_minutes": r.max_extra_minutes,
                    "status": r.status.value, "is_demo": r.is_demo})
    return out


@router.get("/trips")
def trips(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    out = []
    for t in db.scalars(select(TripInstance).order_by(TripInstance.travel_date, TripInstance.target_time).limit(300)):
        out.append({"id": t.id, "commuter": db.get(User, t.commuter_id).full_name, "date": t.travel_date.isoformat(),
                    "direction": t.direction.value, "time": t.target_time.strftime("%H:%M"),
                    "status": t.status.value, "matched": t.match_group_id is not None, "is_demo": t.is_demo})
    return out
