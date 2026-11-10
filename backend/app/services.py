"""Shared business logic: recurring schedule generation, fare sharing, notifications, audit log."""
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (AdminAction, Direction, Notification, RecurringPlan, TripInstance, TripStatus)

WEEKDAY_PATTERNS = {"mon_fri": [0, 1, 2, 3, 4], "mon_sat": [0, 1, 2, 3, 4, 5]}
GENERATION_HORIZON_DAYS = 14


def pattern_for(days: list[int]) -> str:
    s = sorted(set(days))
    for name, wanted in WEEKDAY_PATTERNS.items():
        if s == wanted:
            return name
    return "custom"


def generate_trip_instances(db: Session, plan: RecurringPlan, horizon_days: int = GENERATION_HORIZON_DAYS,
                            is_demo: bool = False) -> int:
    """Create one TripInstance per travel date. Existing dates are left untouched, so a skipped
    day stays skipped and re-running the generator is safe (the worker calls this daily)."""
    if not plan.is_active:
        return 0
    today = date.today()
    first = max(plan.start_date, today)
    last = today + timedelta(days=horizon_days)
    if plan.end_date:
        last = min(last, plan.end_date)
    existing = set(db.scalars(select(TripInstance.travel_date).where(TripInstance.plan_id == plan.id)))
    created, d = 0, first
    while d <= last:
        if d.weekday() in plan.weekdays and d not in existing:
            db.add(TripInstance(plan_id=plan.id, commuter_id=plan.commuter_id, travel_date=d,
                                direction=plan.direction, target_time=plan.target_time,
                                status=TripStatus.matching, is_demo=is_demo))
            created += 1
        d += timedelta(days=1)
    plan.generated_until = last
    db.flush()
    return created


def distance_proportional_fares(distances_km: list[float], total_fare: float) -> list[float]:
    """Fare_i = d_i / sum(d_j) * F_total  (CommuteLoop fare distribution algorithm).
    Rounding drift is pushed onto the longest rider so shares always add up to F_total."""
    total_d = sum(distances_km)
    if total_d <= 0:
        return [0.0 for _ in distances_km]
    shares = [round(d / total_d * total_fare, 2) for d in distances_km]
    drift = round(total_fare - sum(shares), 2)
    if drift:
        shares[shares.index(max(shares))] = round(max(shares) + drift, 2)
    return shares


def auto_fare(distance_km: float, base_km: float = 2.0, base_fare: float = 36.0, per_km: float = 18.0) -> float:
    """Illustrative Bengaluru auto tariff used in the project deck (Rs 36 for 2 km + Rs 18/km). SIMULATED."""
    return base_fare + max(0.0, distance_km - base_km) * per_km


def notify(db: Session, user_id: str, title: str, body: str, kind: str = "info") -> Notification:
    """Stored in-app now. FCM push is wired in the notification phase; `delivered` stays False until then."""
    n = Notification(user_id=user_id, title=title, body=body, kind=kind, channel="in_app")
    db.add(n)
    return n


def audit(db: Session, admin_id: str, action: str, target_type: str, target_id: str | None,
          detail: dict | None = None) -> None:
    db.add(AdminAction(admin_id=admin_id, action=action, target_type=target_type, target_id=target_id,
                       detail=detail))


def release_group_trips(db: Session, group, message: str) -> None:
    """Detach every trip from a group that fell through, so the trips go back to matching, and tell the riders."""
    from .models import MatchParticipant
    for t in db.scalars(select(TripInstance).where(TripInstance.match_group_id == group.id)):
        if t.status != TripStatus.skipped:
            t.status = TripStatus.matching
        t.match_group_id = None
        notify(db, t.commuter_id, "Your ride needs a new match", message, "match")
    for p in db.scalars(select(MatchParticipant).where(MatchParticipant.match_group_id == group.id)):
        p.response = "pending"


def try_confirm(db: Session, group) -> bool:
    """A group becomes CONFIRMED only when an admin approved it AND the driver accepted AND every rider accepted.
    Nothing is shown as confirmed before that."""
    from .models import AssignmentStatus, DriverAssignment, MatchParticipant, MatchStatus
    db.flush()  # sessions run with autoflush off; make pending accept/response changes visible to the queries below
    if group.status != MatchStatus.approved:
        return False
    parts = db.scalars(select(MatchParticipant).where(MatchParticipant.match_group_id == group.id)).all()
    assignment = db.scalar(select(DriverAssignment).where(DriverAssignment.match_group_id == group.id,
                                                           DriverAssignment.status == AssignmentStatus.accepted))
    if not parts or not assignment or any(p.response != "accepted" for p in parts):
        return False
    group.status = MatchStatus.confirmed
    for t in db.scalars(select(TripInstance).where(TripInstance.match_group_id == group.id)):
        if t.status != TripStatus.skipped:
            t.status = TripStatus.confirmed
    for p in parts:
        notify(db, p.commuter_id, "Ride confirmed", "Your driver and fellow riders have all accepted.", "match")
    notify(db, _driver_user(db, assignment),
           "Ride confirmed", "All riders accepted this group.", "match")
    return True


def _driver_user(db: Session, assignment) -> str:
    from .models import DriverProfile
    return db.get(DriverProfile, assignment.driver_id).user_id
