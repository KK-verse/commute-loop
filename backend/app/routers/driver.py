import re
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import config
from ..database import get_db
from ..models import (AssignmentStatus, DriverAssignment, DriverDocument, DriverProfile, MatchGroup, MatchStatus,
                      MatchParticipant, Role, Route, User, Vehicle, VehicleType, Verification)
from ..schemas import DriverOnboardingIn
from ..security import require_role
from ..services import release_group_trips, try_confirm

router = APIRouter(prefix="/api/driver", tags=["driver"])
driver_only = require_role(Role.driver)

DOC_TYPES = {"licence", "rc", "insurance", "permit", "id_proof"}
ALLOWED_MIME = {"application/pdf", "image/jpeg", "image/png"}
MAX_BYTES = 5 * 1024 * 1024
# Statutory capacity differs by vehicle and state; these are only SANITY CEILINGS for form validation.
# The driver's declared figure is verified by an admin against the registration certificate / permit.
SANITY_CEILING = {"bike": 1, "auto": 3, "taxi": 6}


def _t(v):
    return v.strftime("%H:%M") if v else None


def _profile(user: User) -> DriverProfile:
    return user.driver_profile


def vehicle_dto(v: Vehicle | None) -> dict | None:
    if not v:
        return None
    return {"id": v.id, "registration_number": v.registration_number, "category": v.category.value,
            "model": v.model, "permitted_passenger_capacity": v.permitted_passenger_capacity,
            "insurance_provider": v.insurance_provider, "insurance_policy_number": v.insurance_policy_number,
            "insurance_expiry": v.insurance_expiry.isoformat() if v.insurance_expiry else None,
            "permit_number": v.permit_number, "eligibility_status": v.eligibility_status.value}


@router.put("/onboarding")
def save_onboarding(body: DriverOnboardingIn, user: User = Depends(driver_only), db: Session = Depends(get_db)):
    v = body.vehicle
    ceiling = SANITY_CEILING[v.category]
    if v.permitted_passenger_capacity > ceiling:
        raise HTTPException(422, f"A {v.category} cannot be registered with more than {ceiling} passenger seat(s). "
                                 "Check the capacity printed on the registration certificate.")
    if any(d < 0 or d > 6 for d in body.available_days):
        raise HTTPException(422, "Days must be Monday to Sunday.")
    reg = re.sub(r"\s+", "", v.registration_number).upper()
    clash = db.scalar(select(Vehicle).where(Vehicle.registration_number == reg))
    prof = _profile(user)
    if clash and clash.driver_id != prof.id:
        raise HTTPException(409, "This vehicle registration is already linked to another driver.")
    if body.email and body.email != user.email:
        if db.scalar(select(User.id).where(User.email == body.email, User.id != user.id)):
            raise HTTPException(409, "This email is already used by another account.")
        user.email = body.email
    user.full_name = body.full_name.strip()
    prof.city, prof.licence_number, prof.licence_expiry = body.city, body.licence_number.upper(), body.licence_expiry
    prof.service_areas = [{"name": a} for a in body.service_areas]
    prof.available_days = sorted(set(body.available_days))
    prof.morning_start, prof.morning_end = body.morning_start, body.morning_end
    prof.evening_start, prof.evening_end = body.evening_start, body.evening_end

    veh = clash or db.scalar(select(Vehicle).where(Vehicle.driver_id == prof.id)) or Vehicle(
        driver_id=prof.id, registration_number=reg, category=VehicleType(v.category),
        permitted_passenger_capacity=v.permitted_passenger_capacity)
    material_change = veh.id is not None and (veh.registration_number != reg or veh.category.value != v.category or
                                              veh.permitted_passenger_capacity != v.permitted_passenger_capacity)
    veh.registration_number, veh.category, veh.model = reg, VehicleType(v.category), v.model
    veh.permitted_passenger_capacity = v.permitted_passenger_capacity
    veh.insurance_provider, veh.insurance_policy_number = v.insurance_provider, v.insurance_policy_number
    veh.insurance_expiry, veh.permit_number = v.insurance_expiry, v.permit_number
    db.add(veh)
    # Changing vehicle identity or capacity sends the driver back to review.
    if material_change and prof.verification_status == Verification.approved:
        prof.verification_status = Verification.pending
        veh.eligibility_status = Verification.pending
    user.onboarding_complete = True
    db.commit()
    return get_profile(user, db)


@router.get("/profile")
def get_profile(user: User = Depends(driver_only), db: Session = Depends(get_db)):
    p = _profile(user)
    veh = db.scalar(select(Vehicle).where(Vehicle.driver_id == p.id))
    return {"full_name": user.full_name, "phone": user.phone, "email": user.email, "city": p.city,
            "licence_number": p.licence_number,
            "licence_expiry": p.licence_expiry.isoformat() if p.licence_expiry else None,
            "service_areas": [a["name"] for a in (p.service_areas or [])],
            "available_days": p.available_days or [], "morning_start": _t(p.morning_start),
            "morning_end": _t(p.morning_end), "evening_start": _t(p.evening_start),
            "evening_end": _t(p.evening_end), "verification_status": p.verification_status.value,
            "verification_note": p.verification_note, "vehicle": vehicle_dto(veh),
            "onboarding_complete": user.onboarding_complete}


@router.get("/documents")
def list_documents(user: User = Depends(driver_only), db: Session = Depends(get_db)):
    rows = db.scalars(select(DriverDocument).where(DriverDocument.driver_id == _profile(user).id)).all()
    return [{"id": d.id, "doc_type": d.doc_type, "filename": d.original_filename, "status": d.status.value,
             "review_note": d.review_note, "uploaded_at": d.created_at.isoformat()} for d in rows]


@router.post("/documents")
async def upload_document(doc_type: str = Form(...), file: UploadFile = File(...),
                          user: User = Depends(driver_only), db: Session = Depends(get_db)):
    """Stored on private disk/object storage under a random key. No public URL is ever generated;
    admins read documents through an authenticated endpoint (added with the verification phase)."""
    if doc_type not in DOC_TYPES:
        raise HTTPException(422, "Unknown document type.")
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(422, "Upload a PDF, JPG or PNG file.")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File is larger than 5 MB.")
    prof = _profile(user)
    key = f"{prof.id}/{uuid.uuid4().hex}{'.pdf' if file.content_type == 'application/pdf' else '.img'}"
    dest = config.DOCUMENT_STORAGE_DIR / key
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    veh = db.scalar(select(Vehicle).where(Vehicle.driver_id == prof.id))
    doc = DriverDocument(driver_id=prof.id, vehicle_id=veh.id if veh else None, doc_type=doc_type,
                         storage_key=key, original_filename=(file.filename or "")[:200])
    db.add(doc)
    db.commit()
    return {"id": doc.id, "doc_type": doc.doc_type, "status": doc.status.value}


def _assignment_dto(db: Session, a: DriverAssignment) -> dict:
    g = db.get(MatchGroup, a.match_group_id)
    parts = db.scalars(select(MatchParticipant).where(MatchParticipant.match_group_id == g.id)
                       .order_by(MatchParticipant.pickup_order)).all()
    route = db.scalar(select(Route).where(Route.match_group_id == g.id))
    return {"id": a.id, "status": a.status.value, "match_group_id": g.id,
            "date": g.travel_date.isoformat() if g.travel_date else None, "direction": g.direction.value,
            "passenger_count": len(parts), "is_demo": g.is_demo,
            "expected_duration_min": round(route.total_duration_s / 60) if route and route.total_duration_s else None,
            "route_is_simulated": route.is_simulated if route else None,
            "passengers": [{"name": db.get(User, p.commuter_id).full_name, "order": p.pickup_order,
                            "pickup_time": _t(p.est_pickup_time)} for p in parts]}


@router.get("/dashboard")
def dashboard(user: User = Depends(driver_only), db: Session = Depends(get_db)):
    p = _profile(user)
    veh = db.scalar(select(Vehicle).where(Vehicle.driver_id == p.id))
    approved = p.verification_status == Verification.approved
    out = {"onboarding_complete": user.onboarding_complete, "verification_status": p.verification_status.value,
           "verification_note": p.verification_note, "can_receive_assignments": approved,
           "vehicle": vehicle_dto(veh), "seats_available": veh.permitted_passenger_capacity if veh else None,
           "today": [], "upcoming": [], "offers": [],
           "data_sources": {"assignments": "driver_assignments, match_groups, routes",
                            "seats": "vehicles.permitted_passenger_capacity"}}
    if not approved:
        return out
    today = date.today()
    rows = db.scalars(select(DriverAssignment).where(DriverAssignment.driver_id == p.id)).all()
    for a in rows:
        if db.get(MatchGroup, a.match_group_id).status not in (MatchStatus.approved, MatchStatus.confirmed):
            continue  # still under admin review
        dto = _assignment_dto(db, a)
        if a.status == AssignmentStatus.offered:
            out["offers"].append(dto)
        elif a.status == AssignmentStatus.accepted and dto["date"]:
            d = date.fromisoformat(dto["date"])
            (out["today"] if d == today else out["upcoming"] if d > today else []).append(dto)
    return out


@router.get("/requests")
def ride_requests(user: User = Depends(driver_only), db: Session = Depends(get_db)):
    p = _profile(user)
    if p.verification_status != Verification.approved:
        return []
    rows = db.scalars(select(DriverAssignment).where(DriverAssignment.driver_id == p.id,
                                                     DriverAssignment.status == AssignmentStatus.offered)).all()
    return [_assignment_dto(db, a) for a in rows
            if db.get(MatchGroup, a.match_group_id).status == MatchStatus.approved]


@router.post("/assignments/{assignment_id}/{decision}")
def respond(assignment_id: str, decision: str, user: User = Depends(driver_only), db: Session = Depends(get_db)):
    if decision not in ("accept", "reject"):
        raise HTTPException(404, "Unknown action.")
    p = _profile(user)
    if p.verification_status != Verification.approved:
        raise HTTPException(403, "Your documents must be approved before you can take assignments.")
    a = db.get(DriverAssignment, assignment_id)
    if not a or a.driver_id != p.id:
        raise HTTPException(404, "Assignment not found.")
    if a.status != AssignmentStatus.offered:
        raise HTTPException(409, "This assignment has already been answered.")
    a.status = AssignmentStatus.accepted if decision == "accept" else AssignmentStatus.rejected
    a.responded_at = datetime.now(timezone.utc)
    g = db.get(MatchGroup, a.match_group_id)
    if decision == "reject":  # send the group back for re-matching
        g.status = MatchStatus.proposed
        release_group_trips(db, g, "The driver could not take this ride. We are finding another match.")
    else:
        try_confirm(db, g)
    db.commit()
    return {"ok": True, "status": a.status.value, "group_status": g.status.value}


@router.get("/route/next")
def next_route(user: User = Depends(driver_only), db: Session = Depends(get_db)):
    """Stops of the driver's next accepted/offered assignment. Marked simulated unless a routing API produced it."""
    from ..models import RouteStop
    p = _profile(user)
    if p.verification_status != Verification.approved:
        return None
    rows = db.scalars(select(DriverAssignment).where(DriverAssignment.driver_id == p.id,
                                                     DriverAssignment.status.in_(
                                                         (AssignmentStatus.accepted, AssignmentStatus.offered)))).all()
    if not rows:
        return None
    rows = [x for x in rows if db.get(MatchGroup, x.match_group_id).status in
            (MatchStatus.approved, MatchStatus.confirmed)]
    if not rows:
        return None
    a = min(rows, key=lambda x: (x.status != AssignmentStatus.accepted, x.created_at))
    g = db.get(MatchGroup, a.match_group_id)
    route = db.scalar(select(Route).where(Route.match_group_id == g.id))
    stops = db.scalars(select(RouteStop).where(RouteStop.route_id == route.id).order_by(RouteStop.sequence)).all() \
        if route else []
    return {"assignment": _assignment_dto(db, a), "is_simulated": route.is_simulated if route else True,
            "stops": [{"sequence": s.sequence, "type": s.stop_type, "label": s.label, "lat": s.latitude,
                       "lng": s.longitude, "eta": _t(s.eta)} for s in stops]}
