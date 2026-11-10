from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (CancellationRecord, CommutePreference, CommuteRequest, CommuterProfile, Direction,
                      DriverProfile, FareCalculation, LocationKind, MatchGroup, MatchParticipant, MatchStatus, Notification,
                      RecurringPlan, RequestStatus, Role, SavedLocation, TripInstance, TripStatus, User, Vehicle)
from ..schemas import CommuterOnboardingIn, LocationIn, SkipIn
from ..security import require_role
from ..services import generate_trip_instances, pattern_for

router = APIRouter(prefix="/api/commuter", tags=["commuter"])
commuter_only = require_role(Role.commuter)

DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
OPEN_STATES = (TripStatus.matching, TripStatus.proposed, TripStatus.confirmed, TripStatus.in_progress,
               TripStatus.reassignment_pending, TripStatus.no_match)


def _t(v: time | None) -> str | None:
    return v.strftime("%H:%M") if v else None


def loc_dto(l: SavedLocation | None) -> dict | None:
    if not l:
        return None
    return {"id": l.id, "kind": l.kind.value, "label": l.label, "address": l.address, "latitude": l.latitude,
            "longitude": l.longitude, "place_id": l.place_id, "pickup_label": l.pickup_label,
            "pickup_latitude": l.pickup_latitude, "pickup_longitude": l.pickup_longitude,
            "confirmed": l.confirmed, "accuracy_m": l.accuracy_m, "geocode_source": l.geocode_source}


def _upsert_location(db: Session, user: User, kind: LocationKind, data: LocationIn) -> SavedLocation:
    loc = db.scalar(select(SavedLocation).where(SavedLocation.user_id == user.id, SavedLocation.kind == kind))
    if not loc:
        loc = SavedLocation(user_id=user.id, kind=kind)
        db.add(loc)
    for k, v in data.model_dump().items():
        setattr(loc, k, v)
    db.flush()
    return loc


def _active_request(db: Session, user: User) -> CommuteRequest | None:
    return db.scalar(select(CommuteRequest).where(CommuteRequest.commuter_id == user.id,
                                                  CommuteRequest.status != RequestStatus.closed)
                     .order_by(CommuteRequest.created_at.desc()))


@router.put("/onboarding")
def save_onboarding(body: CommuterOnboardingIn, user: User = Depends(commuter_only), db: Session = Depends(get_db)):
    """Create or edit the commuter's profile, locations, preferences and recurring plans in one transaction."""
    user.full_name = body.full_name.strip()
    if body.email and body.email != user.email:
        if db.scalar(select(User.id).where(User.email == body.email, User.id != user.id)):
            raise HTTPException(409, "This email is already used by another account.")
        user.email = body.email
    prof = user.commuter_profile or CommuterProfile(user_id=user.id)
    prof.company_name, prof.city = body.company_name, body.city
    db.add(prof)

    home = _upsert_location(db, user, LocationKind.home, body.home)
    office = _upsert_location(db, user, LocationKind.office, body.office)

    pref = db.scalar(select(CommutePreference).where(CommutePreference.user_id == user.id)) or \
        CommutePreference(user_id=user.id)
    pref.preferred_vehicle, pref.max_extra_minutes = body.preferred_vehicle, body.max_extra_minutes
    pref.prefers_fixed_group, pref.accepts_alternative_matches = body.prefers_fixed_group, \
        body.accepts_alternative_matches
    db.add(pref)

    req = _active_request(db, user) or CommuteRequest(commuter_id=user.id, home_location_id=home.id,
                                                      office_location_id=office.id,
                                                      arrival_deadline=body.arrival_time, travel_days=[])
    req.home_location_id, req.office_location_id = home.id, office.id
    req.arrival_deadline, req.evening_departure_time = body.arrival_time, body.departure_time
    req.travel_days, req.preferred_vehicle = body.working_days, body.preferred_vehicle
    req.max_extra_minutes, req.prefers_fixed_group = body.max_extra_minutes, body.prefers_fixed_group
    req.status = RequestStatus.active
    db.add(req)
    db.flush()

    start = body.start_date or date.today()
    pattern = pattern_for(body.working_days)
    wanted = [(Direction.morning, body.arrival_time)]
    if body.departure_time:
        wanted.append((Direction.evening, body.departure_time))
    kept = set()
    for direction, tt in wanted:
        plan = db.scalar(select(RecurringPlan).where(RecurringPlan.commuter_id == user.id,
                                                     RecurringPlan.direction == direction))
        if not plan:
            plan = RecurringPlan(request_id=req.id, commuter_id=user.id, direction=direction, weekdays=[],
                                 target_time=tt, start_date=start)
            db.add(plan)
        plan.request_id, plan.pattern, plan.weekdays = req.id, pattern, body.working_days
        plan.target_time, plan.start_date, plan.end_date, plan.is_active = tt, start, body.end_date, True
        db.flush()
        kept.add(plan.id)
        # Plan edits: future, still-unmatched trips on days no longer selected are removed;
        # trips on skipped dates are preserved.
        for t in db.scalars(select(TripInstance).where(TripInstance.plan_id == plan.id,
                                                       TripInstance.travel_date >= date.today(),
                                                       TripInstance.status == TripStatus.matching)):
            if t.travel_date.weekday() not in body.working_days:
                db.delete(t)
            else:
                t.target_time = tt
        generate_trip_instances(db, plan)
    # evening plan removed when the commuter clears a return time
    for plan in db.scalars(select(RecurringPlan).where(RecurringPlan.commuter_id == user.id)):
        if plan.id not in kept:
            plan.is_active = False
    user.onboarding_complete = True
    db.commit()
    return get_profile(user, db)


@router.get("/profile")
def get_profile(user: User = Depends(commuter_only), db: Session = Depends(get_db)):
    prof, pref = user.commuter_profile, db.scalar(select(CommutePreference).where(CommutePreference.user_id == user.id))
    home = db.scalar(select(SavedLocation).where(SavedLocation.user_id == user.id,
                                                 SavedLocation.kind == LocationKind.home))
    office = db.scalar(select(SavedLocation).where(SavedLocation.user_id == user.id,
                                                   SavedLocation.kind == LocationKind.office))
    req = _active_request(db, user)
    return {
        "full_name": user.full_name, "phone": user.phone, "email": user.email,
        "company_name": prof.company_name if prof else None, "city": prof.city if prof else None,
        "home": loc_dto(home), "office": loc_dto(office),
        "arrival_time": _t(req.arrival_deadline) if req else None,
        "departure_time": _t(req.evening_departure_time) if req else None,
        "working_days": req.travel_days if req else [],
        "preferred_vehicle": pref.preferred_vehicle if pref else "any",
        "max_extra_minutes": pref.max_extra_minutes if pref else 15,
        "prefers_fixed_group": pref.prefers_fixed_group if pref else False,
        "accepts_alternative_matches": pref.accepts_alternative_matches if pref else True,
        "request_status": req.status.value if req else None,
        "onboarding_complete": user.onboarding_complete,
    }


def _trip_dto(db: Session, t: TripInstance) -> dict:
    out = {"id": t.id, "date": t.travel_date.isoformat(), "weekday": DAY_NAMES[t.travel_date.weekday()],
           "direction": t.direction.value, "target_time": _t(t.target_time), "status": t.status.value,
           "is_demo": t.is_demo, "driver": None, "fellow_passengers": None, "pickup_time": None,
           "arrival_time": None, "pickup_order": None, "fare_inr": None, "solo_fare_inr": None,
           "saving_inr": None, "fare_is_simulated": None, "vehicle": None, "stops": []}
    out["under_review"] = False
    g = db.get(MatchGroup, t.match_group_id) if t.match_group_id else None
    if g and g.status == MatchStatus.proposed:
        out["under_review"] = True
        g = None
    if g:
        part = db.scalar(select(MatchParticipant).where(MatchParticipant.match_group_id == g.id,
                                                        MatchParticipant.commuter_id == t.commuter_id))
        if g.driver_id:
            d = db.get(DriverProfile, g.driver_id)
            v = db.get(Vehicle, g.vehicle_id) if g.vehicle_id else None
            out["driver"] = {"name": d.user.full_name, "phone": d.user.phone}
            if v:
                out["vehicle"] = {"category": v.category.value, "model": v.model,
                                  "registration": v.registration_number}
        n = db.scalars(select(MatchParticipant).where(MatchParticipant.match_group_id == g.id)).all()
        out["fellow_passengers"] = max(0, len(n) - 1)
        if part:
            out.update(pickup_time=_t(part.est_pickup_time), arrival_time=_t(part.est_arrival_time),
                       pickup_order=part.pickup_order)
        fare = db.scalar(select(FareCalculation).where(FareCalculation.match_group_id == g.id,
                                                       FareCalculation.commuter_id == t.commuter_id))
        if fare:
            out.update(fare_inr=float(fare.share_inr), solo_fare_inr=float(fare.solo_fare_inr or 0),
                       saving_inr=float(fare.saving_inr or 0), fare_is_simulated=fare.is_simulated)
    return out


@router.get("/dashboard")
def dashboard(user: User = Depends(commuter_only), db: Session = Depends(get_db)):
    today = date.today()
    trips = db.scalars(select(TripInstance).where(TripInstance.commuter_id == user.id,
                                                  TripInstance.travel_date >= today,
                                                  TripInstance.travel_date <= today + timedelta(days=13))
                       .order_by(TripInstance.travel_date, TripInstance.target_time)).all()
    upcoming = [t for t in trips if t.status != TripStatus.skipped]
    nxt = next((t for t in upcoming if t.status in OPEN_STATES), None)
    # weekly schedule: Monday-Sunday of the current week
    monday = today - timedelta(days=today.weekday())
    week = []
    for i in range(7):
        d = monday + timedelta(days=i)
        day_trips = db.scalars(select(TripInstance).where(TripInstance.commuter_id == user.id,
                                                          TripInstance.travel_date == d)).all()
        week.append({"date": d.isoformat(), "weekday": DAY_NAMES[i], "is_today": d == today,
                     "trips": [{"id": t.id, "direction": t.direction.value, "time": _t(t.target_time),
                                "status": t.status.value} for t in day_trips]})
    pending = db.scalar(select(MatchParticipant).join(MatchGroup, MatchGroup.id == MatchParticipant.match_group_id)
                        .where(MatchParticipant.commuter_id == user.id, MatchParticipant.response == "pending",
                               MatchGroup.status == MatchStatus.approved))
    req = _active_request(db, user)
    return {
        "onboarding_complete": user.onboarding_complete,
        "request_status": req.status.value if req else None,
        "next_trip": _trip_dto(db, nxt) if nxt else None,
        "pending_proposal": pending is not None,
        "week": week,
        "counts": {"upcoming": len(upcoming), "skipped": len(trips) - len(upcoming)},
        "data_sources": {"next_trip": "trip_instances", "week": "trip_instances",
                         "driver_and_fare": "match_groups, match_participants, fare_calculations"},
    }


@router.get("/trips")
def list_trips(user: User = Depends(commuter_only), db: Session = Depends(get_db)):
    today = date.today()
    trips = db.scalars(select(TripInstance).where(TripInstance.commuter_id == user.id,
                                                  TripInstance.travel_date >= today)
                       .order_by(TripInstance.travel_date, TripInstance.target_time)).all()
    return [_trip_dto(db, t) for t in trips]


@router.get("/schedule")
def schedule(user: User = Depends(commuter_only), db: Session = Depends(get_db)):
    plans = db.scalars(select(RecurringPlan).where(RecurringPlan.commuter_id == user.id)
                       .order_by(RecurringPlan.direction)).all()
    return [{"id": p.id, "direction": p.direction.value, "pattern": p.pattern, "weekdays": p.weekdays,
             "time": _t(p.target_time), "start_date": p.start_date.isoformat(),
             "end_date": p.end_date.isoformat() if p.end_date else None, "is_active": p.is_active}
            for p in plans]


@router.post("/trips/{trip_id}/skip")
def skip_trip(trip_id: str, body: SkipIn, user: User = Depends(commuter_only), db: Session = Depends(get_db)):
    """Skips ONE date. The recurring plan stays active and other dates are untouched."""
    t = db.get(TripInstance, trip_id)
    if not t or t.commuter_id != user.id:
        raise HTTPException(404, "Trip not found.")
    if t.status in (TripStatus.in_progress, TripStatus.completed, TripStatus.cancelled):
        raise HTTPException(409, "This trip can no longer be skipped.")
    if t.travel_date < date.today():
        raise HTTPException(409, "This date has already passed.")
    was_matched = t.match_group_id is not None
    t.status = TripStatus.skipped
    db.add(CancellationRecord(trip_id=t.id, match_group_id=t.match_group_id, cancelled_by=user.id,
                              cancelled_by_role=Role.commuter, reason=body.reason, kind="skip"))
    db.commit()
    return {"ok": True, "trip_id": t.id, "status": t.status.value, "plan_still_active": True,
            "note": "Other passengers will be told about the change." if was_matched else None}


@router.post("/trips/{trip_id}/unskip")
def unskip_trip(trip_id: str, user: User = Depends(commuter_only), db: Session = Depends(get_db)):
    t = db.get(TripInstance, trip_id)
    if not t or t.commuter_id != user.id or t.status != TripStatus.skipped:
        raise HTTPException(404, "Skipped trip not found.")
    t.status = TripStatus.matching
    t.match_group_id = None
    db.commit()
    return {"ok": True, "status": t.status.value}


@router.get("/notifications")
def notifications(user: User = Depends(commuter_only), db: Session = Depends(get_db)):
    rows = db.scalars(select(Notification).where(Notification.user_id == user.id)
                      .order_by(Notification.created_at.desc()).limit(30)).all()
    return [{"id": n.id, "title": n.title, "body": n.body, "kind": n.kind, "read": n.read_at is not None,
             "created_at": n.created_at.isoformat()} for n in rows]


# ------------------------------------------------------------ safety and support
from pydantic import BaseModel, Field  # noqa: E402

from ..models import EmergencyContact, SafetyIncident  # noqa: E402
from ..security import normalise_phone  # noqa: E402


class ContactIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str
    relationship_label: str | None = Field(default=None, max_length=40)


class IncidentIn(BaseModel):
    category: str = Field(default="other", max_length=40)
    severity: str = Field(default="medium", pattern="^(low|medium|high|critical)$")
    description: str = Field(min_length=5, max_length=1500)


@router.get("/emergency-contacts")
def list_contacts(user: User = Depends(commuter_only), db: Session = Depends(get_db)):
    rows = db.scalars(select(EmergencyContact).where(EmergencyContact.user_id == user.id)).all()
    return [{"id": c.id, "name": c.name, "phone": c.phone, "relationship": c.relationship_label} for c in rows]


@router.post("/emergency-contacts")
def add_contact(body: ContactIn, user: User = Depends(commuter_only), db: Session = Depends(get_db)):
    n = len(db.scalars(select(EmergencyContact.id).where(EmergencyContact.user_id == user.id)).all())
    if n >= 5:
        raise HTTPException(409, "You can save up to 5 emergency contacts.")
    c = EmergencyContact(user_id=user.id, name=body.name.strip(), phone=normalise_phone(body.phone),
                         relationship_label=body.relationship_label)
    db.add(c)
    db.commit()
    return {"id": c.id, "name": c.name, "phone": c.phone, "relationship": c.relationship_label}


@router.delete("/emergency-contacts/{contact_id}")
def delete_contact(contact_id: str, user: User = Depends(commuter_only), db: Session = Depends(get_db)):
    c = db.get(EmergencyContact, contact_id)
    if not c or c.user_id != user.id:
        raise HTTPException(404, "Contact not found.")
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.post("/incidents")
def report_incident(body: IncidentIn, user: User = Depends(commuter_only), db: Session = Depends(get_db)):
    inc = SafetyIncident(reported_by=user.id, category=body.category, severity=body.severity,
                         description=body.description.strip())
    db.add(inc)
    db.commit()
    return {"id": inc.id, "status": inc.status}
