"""Match review flow: admin approves a proposed group, then riders and the driver each accept.
(The scoring engine that PRODUCES proposals arrives in the next phase; this is the lifecycle around it.)"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (AssignmentStatus, DriverAssignment, DriverProfile, FareCalculation, MatchGroup,
                      MatchParticipant, MatchStatus, Role, Route, RouteStop, TripInstance, TripStatus, User, Vehicle)
from ..security import require_role
from ..services import audit, notify, release_group_trips, try_confirm

router = APIRouter(prefix="/api", tags=["matches"])


def _t(v):
    return v.strftime("%H:%M") if v else None


def _group_dto(db: Session, g: MatchGroup, viewer_id: str | None = None) -> dict:
    drv = db.get(DriverProfile, g.driver_id) if g.driver_id else None
    veh = db.get(Vehicle, g.vehicle_id) if g.vehicle_id else None
    route = db.scalar(select(Route).where(Route.match_group_id == g.id))
    stops = db.scalars(select(RouteStop).where(RouteStop.route_id == route.id).order_by(RouteStop.sequence)).all() \
        if route else []
    parts = db.scalars(select(MatchParticipant).where(MatchParticipant.match_group_id == g.id)
                       .order_by(MatchParticipant.pickup_order)).all()
    assignment = db.scalar(select(DriverAssignment).where(DriverAssignment.match_group_id == g.id))
    fares = {f.commuter_id: f for f in db.scalars(select(FareCalculation).where(FareCalculation.match_group_id == g.id))}
    return {
        "id": g.id, "status": g.status.value, "date": g.travel_date.isoformat() if g.travel_date else None,
        "direction": g.direction.value, "is_demo": g.is_demo, "score": g.score, "score_components": g.score_components,
        "explanation": g.explanation, "capacity_used": g.capacity_used,
        "capacity": veh.permitted_passenger_capacity if veh else None,
        "driver": {"name": drv.user.full_name, "phone": drv.user.phone} if drv else None,
        "vehicle": {"category": veh.category.value, "model": veh.model, "registration": veh.registration_number}
        if veh else None,
        "driver_response": assignment.status.value if assignment else None,
        "route_is_simulated": route.is_simulated if route else True,
        "total_minutes": round(route.total_duration_s / 60) if route and route.total_duration_s else None,
        "direct_minutes": round(route.direct_duration_s / 60) if route and route.direct_duration_s else None,
        "stops": [{"sequence": s.sequence, "type": s.stop_type, "label": s.label, "lat": s.latitude,
                   "lng": s.longitude, "eta": _t(s.eta)} for s in stops],
        "participants": [{"commuter_id": p.commuter_id, "name": db.get(User, p.commuter_id).full_name,
                          "order": p.pickup_order, "pickup_time": _t(p.est_pickup_time),
                          "arrival_time": _t(p.est_arrival_time), "response": p.response,
                          "fare_inr": float(fares[p.commuter_id].share_inr) if p.commuter_id in fares else None,
                          "solo_fare_inr": float(fares[p.commuter_id].solo_fare_inr or 0) if p.commuter_id in fares else None,
                          "saving_inr": float(fares[p.commuter_id].saving_inr or 0) if p.commuter_id in fares else None,
                          "distance_km": fares[p.commuter_id].passenger_distance_km if p.commuter_id in fares else None,
                          "fare_is_simulated": fares[p.commuter_id].is_simulated if p.commuter_id in fares else None}
                         for p in parts],
        "you": viewer_id,
    }


class Respond(BaseModel):
    accept: bool


class Decision(BaseModel):
    decision: str = Field(pattern="^(approve|reject)$")
    note: str | None = Field(default=None, max_length=400)


@router.get("/commuter/proposals")
def my_proposals(user: User = Depends(require_role(Role.commuter)), db: Session = Depends(get_db)):
    gids = db.scalars(select(MatchParticipant.match_group_id).where(MatchParticipant.commuter_id == user.id)).all()
    out = []
    for g in db.scalars(select(MatchGroup).where(MatchGroup.id.in_(gids),
                                                  MatchGroup.status.in_((MatchStatus.approved, MatchStatus.confirmed)))):
        out.append(_group_dto(db, g, user.id))
    return out


@router.post("/commuter/proposals/{group_id}/respond")
def respond(group_id: str, body: Respond, user: User = Depends(require_role(Role.commuter)),
            db: Session = Depends(get_db)):
    g = db.get(MatchGroup, group_id)
    part = db.scalar(select(MatchParticipant).where(MatchParticipant.match_group_id == group_id,
                                                    MatchParticipant.commuter_id == user.id))
    if not g or not part or g.status != MatchStatus.approved:
        raise HTTPException(404, "This proposal is not open for a response.")
    if body.accept:
        part.response = "accepted"
        try_confirm(db, g)
    else:
        part.response = "rejected"
        trip = db.scalar(select(TripInstance).where(TripInstance.match_group_id == g.id,
                                                    TripInstance.commuter_id == user.id))
        if trip:
            trip.status, trip.match_group_id = TripStatus.matching, None
        db.delete(part)
        g.capacity_used = max(0, g.capacity_used - 1)
    db.commit()
    return {"ok": True, "group_status": g.status.value}


@router.get("/admin/matches")
def all_matches(_: User = Depends(require_role(Role.admin)), db: Session = Depends(get_db)):
    return [_group_dto(db, g) for g in db.scalars(select(MatchGroup).order_by(MatchGroup.created_at.desc()).limit(100))]


@router.post("/admin/matches/{group_id}/decision")
def decide(group_id: str, body: Decision, admin: User = Depends(require_role(Role.admin)),
           db: Session = Depends(get_db)):
    g = db.get(MatchGroup, group_id)
    if not g:
        raise HTTPException(404, "Match not found.")
    if g.status != MatchStatus.proposed:
        raise HTTPException(409, "Only proposed matches can be approved or rejected.")
    assignment = db.scalar(select(DriverAssignment).where(DriverAssignment.match_group_id == g.id))
    if body.decision == "approve":
        drv = db.get(DriverProfile, g.driver_id) if g.driver_id else None
        if not drv or drv.verification_status.value != "approved":
            raise HTTPException(409, "The driver on this match is not approved.")
        g.status = MatchStatus.approved
        for p in db.scalars(select(MatchParticipant).where(MatchParticipant.match_group_id == g.id)):
            notify(db, p.commuter_id, "A ride is proposed for you", "Open Find a Match to review the pickup order "
                   "and fare, then accept or decline.", "match")
        if assignment:
            notify(db, drv.user_id, "New ride request", "Review the pickup sequence under Ride Requests.", "match")
    else:
        g.status = MatchStatus.rejected
        if assignment:
            assignment.status = AssignmentStatus.cancelled
        release_group_trips(db, g, "This proposal was not approved. We will keep looking for a match.")
    audit(db, admin.id, f"match_{body.decision}", "match_group", g.id, {"note": body.note})
    db.commit()
    return _group_dto(db, g)
