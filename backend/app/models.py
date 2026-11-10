"""CommuteLoop data model.

All 21 tables required by the master prompt, plus two auth support tables (otp_codes, auth_sessions).
Coordinates are stored as plain latitude/longitude columns so the schema is portable; on PostgreSQL,
db/postgis_extras.sql adds generated PostGIS `geography(Point,4326)` columns and GiST indexes on top.
"""
import enum
import uuid
from datetime import date, datetime, time, timezone

from sqlalchemy import (Boolean, CheckConstraint, Date, DateTime, Enum, Float, ForeignKey, Index, Integer,
                        JSON, Numeric, String, Text, Time, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _id() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------- enums
class Role(str, enum.Enum):
    commuter = "commuter"
    driver = "driver"
    admin = "admin"


class VehicleType(str, enum.Enum):
    bike = "bike"
    auto = "auto"
    taxi = "taxi"


class Verification(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    suspended = "suspended"


class RequestStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    matched = "matched"
    paused = "paused"
    closed = "closed"


class TripStatus(str, enum.Enum):
    matching = "MATCHING"
    proposed = "PROPOSED"
    confirmed = "CONFIRMED"
    in_progress = "IN_PROGRESS"
    completed = "COMPLETED"
    cancelled = "CANCELLED"
    no_match = "NO_MATCH"
    reassignment_pending = "REASSIGNMENT_PENDING"
    skipped = "SKIPPED"


class Direction(str, enum.Enum):
    morning = "morning"   # home -> office
    evening = "evening"   # office -> home


class LocationKind(str, enum.Enum):
    home = "home"
    office = "office"
    other = "other"


class MatchStatus(str, enum.Enum):
    proposed = "proposed"
    approved = "approved"
    rejected = "rejected"
    confirmed = "confirmed"
    cancelled = "cancelled"


class AssignmentStatus(str, enum.Enum):
    offered = "offered"
    accepted = "accepted"
    rejected = "rejected"
    cancelled = "cancelled"


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"
    failed = "failed"
    refunded = "refunded"
    not_collected = "not_collected"


def _enum(e):
    return Enum(e, native_enum=False, length=32, values_callable=lambda x: [m.value for m in x])


class Stamped:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


# ---------------------------------------------------------------- 1. users
class User(Base, Stamped):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    phone: Mapped[str] = mapped_column(String(16), unique=True, index=True)  # E.164
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    full_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[Role] = mapped_column(_enum(Role), index=True)
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True)  # SIMULATED record
    onboarding_complete: Mapped[bool] = mapped_column(Boolean, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    commuter_profile: Mapped["CommuterProfile | None"] = relationship(back_populates="user", uselist=False,
                                                                      cascade="all, delete-orphan")
    driver_profile: Mapped["DriverProfile | None"] = relationship(back_populates="user", uselist=False,
                                                                  cascade="all, delete-orphan")


class OtpCode(Base):
    __tablename__ = "otp_codes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    phone: Mapped[str] = mapped_column(String(16), index=True)
    code_hash: Mapped[str] = mapped_column(String(128))
    purpose: Mapped[str] = mapped_column(String(16))  # register | login
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class AuthSession(Base):
    """Server-side session so logout really revokes a token."""
    __tablename__ = "auth_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)  # JWT `jti`
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


# ---------------------------------------------------------------- 2. commuter profiles
class CommuterProfile(Base, Stamped):
    __tablename__ = "commuter_profiles"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    company_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    city: Mapped[str | None] = mapped_column(String(40), nullable=True)
    gender: Mapped[str | None] = mapped_column(String(24), nullable=True)
    women_only_preference: Mapped[bool] = mapped_column(Boolean, default=False)
    user: Mapped[User] = relationship(back_populates="commuter_profile")


# ---------------------------------------------------------------- 3. driver profiles
class DriverProfile(Base, Stamped):
    __tablename__ = "driver_profiles"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    licence_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    licence_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    city: Mapped[str | None] = mapped_column(String(40), nullable=True)
    service_areas: Mapped[list | None] = mapped_column(JSON, nullable=True)  # list of {name, lat, lng, radius_km}
    available_days: Mapped[list | None] = mapped_column(JSON, nullable=True)  # [0..6], 0 = Monday
    morning_start: Mapped[time | None] = mapped_column(Time, nullable=True)
    morning_end: Mapped[time | None] = mapped_column(Time, nullable=True)
    evening_start: Mapped[time | None] = mapped_column(Time, nullable=True)
    evening_end: Mapped[time | None] = mapped_column(Time, nullable=True)
    verification_status: Mapped[Verification] = mapped_column(_enum(Verification), default=Verification.pending,
                                                              index=True)
    verification_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    user: Mapped[User] = relationship(back_populates="driver_profile")
    vehicles: Mapped[list["Vehicle"]] = relationship(back_populates="driver", cascade="all, delete-orphan")


# ---------------------------------------------------------------- 4. vehicles
class Vehicle(Base, Stamped):
    __tablename__ = "vehicles"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    driver_id: Mapped[str] = mapped_column(ForeignKey("driver_profiles.id", ondelete="CASCADE"), index=True)
    registration_number: Mapped[str] = mapped_column(String(20), unique=True)
    category: Mapped[VehicleType] = mapped_column(_enum(VehicleType))
    model: Mapped[str | None] = mapped_column(String(80), nullable=True)
    # Legally permitted PASSENGER capacity (excluding driver). Entered by the driver, checked by an admin.
    permitted_passenger_capacity: Mapped[int] = mapped_column(Integer)
    insurance_provider: Mapped[str | None] = mapped_column(String(80), nullable=True)
    insurance_policy_number: Mapped[str | None] = mapped_column(String(40), nullable=True)
    insurance_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    permit_number: Mapped[str | None] = mapped_column(String(40), nullable=True)
    eligibility_status: Mapped[Verification] = mapped_column(_enum(Verification), default=Verification.pending)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    driver: Mapped[DriverProfile] = relationship(back_populates="vehicles")
    __table_args__ = (CheckConstraint("permitted_passenger_capacity >= 1 AND permitted_passenger_capacity <= 8",
                                      name="ck_vehicle_capacity_range"),)


# ---------------------------------------------------------------- 5. driver documents (private storage)
class DriverDocument(Base, Stamped):
    __tablename__ = "driver_documents"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    driver_id: Mapped[str] = mapped_column(ForeignKey("driver_profiles.id", ondelete="CASCADE"), index=True)
    vehicle_id: Mapped[str | None] = mapped_column(ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True)
    doc_type: Mapped[str] = mapped_column(String(32))  # licence | rc | insurance | permit | id_proof
    storage_key: Mapped[str | None] = mapped_column(String(255), nullable=True)  # PRIVATE path, never a public URL
    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[Verification] = mapped_column(_enum(Verification), default=Verification.pending)
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)


# ---------------------------------------------------------------- 6. saved locations
class SavedLocation(Base, Stamped):
    __tablename__ = "saved_locations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[LocationKind] = mapped_column(_enum(LocationKind))
    label: Mapped[str] = mapped_column(String(160))                       # readable place name
    address: Mapped[str] = mapped_column(String(400))                     # readable address
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    place_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pickup_label: Mapped[str | None] = mapped_column(String(160), nullable=True)   # e.g. "Main gate"
    pickup_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    pickup_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)       # user confirmed on the map
    accuracy_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    geocode_source: Mapped[str] = mapped_column(String(24), default="manual")  # google | mapbox | manual | demo
    __table_args__ = (
        CheckConstraint("latitude BETWEEN -90 AND 90", name="ck_loc_lat"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="ck_loc_lng"),
    )


# ---------------------------------------------------------------- 7. commute preferences
class CommutePreference(Base, Stamped):
    __tablename__ = "commute_preferences"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    preferred_vehicle: Mapped[str] = mapped_column(String(16), default="any")  # bike|auto|taxi|any
    max_extra_minutes: Mapped[int] = mapped_column(Integer, default=15)
    prefers_fixed_group: Mapped[bool] = mapped_column(Boolean, default=False)
    accepts_alternative_matches: Mapped[bool] = mapped_column(Boolean, default=True)
    __table_args__ = (CheckConstraint("max_extra_minutes BETWEEN 0 AND 90", name="ck_pref_detour"),)


# ---------------------------------------------------------------- 8. commute requests
class CommuteRequest(Base, Stamped):
    __tablename__ = "commute_requests"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    commuter_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    home_location_id: Mapped[str] = mapped_column(ForeignKey("saved_locations.id"))
    office_location_id: Mapped[str] = mapped_column(ForeignKey("saved_locations.id"))
    morning_departure_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    arrival_deadline: Mapped[time] = mapped_column(Time)        # latest acceptable office arrival
    evening_departure_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    travel_days: Mapped[list] = mapped_column(JSON)             # [0..6], 0 = Monday
    preferred_vehicle: Mapped[str] = mapped_column(String(16), default="any")
    max_extra_minutes: Mapped[int] = mapped_column(Integer, default=15)
    max_travel_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    prefers_fixed_group: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[RequestStatus] = mapped_column(_enum(RequestStatus), default=RequestStatus.active, index=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


# ---------------------------------------------------------------- 9. recurring plans
class RecurringPlan(Base, Stamped):
    __tablename__ = "recurring_plans"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    request_id: Mapped[str] = mapped_column(ForeignKey("commute_requests.id", ondelete="CASCADE"), index=True)
    commuter_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    direction: Mapped[Direction] = mapped_column(_enum(Direction))
    pattern: Mapped[str] = mapped_column(String(16), default="mon_fri")  # mon_fri | mon_sat | custom
    weekdays: Mapped[list] = mapped_column(JSON)
    target_time: Mapped[time] = mapped_column(Time)  # arrival deadline (morning) or departure (evening)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    generated_until: Mapped[date | None] = mapped_column(Date, nullable=True)


# ---------------------------------------------------------------- 10. daily trip instances
class TripInstance(Base, Stamped):
    __tablename__ = "trip_instances"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    plan_id: Mapped[str] = mapped_column(ForeignKey("recurring_plans.id", ondelete="CASCADE"), index=True)
    commuter_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    travel_date: Mapped[date] = mapped_column(Date, index=True)
    direction: Mapped[Direction] = mapped_column(_enum(Direction))
    target_time: Mapped[time] = mapped_column(Time)
    status: Mapped[TripStatus] = mapped_column(_enum(TripStatus), default=TripStatus.matching, index=True)
    match_group_id: Mapped[str | None] = mapped_column(ForeignKey("match_groups.id", ondelete="SET NULL"),
                                                       nullable=True, index=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    __table_args__ = (UniqueConstraint("plan_id", "travel_date", name="uq_trip_plan_date"),
                      Index("ix_trip_commuter_date", "commuter_id", "travel_date"))


# ---------------------------------------------------------------- 11. match groups
class MatchGroup(Base, Stamped):
    __tablename__ = "match_groups"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    driver_id: Mapped[str | None] = mapped_column(ForeignKey("driver_profiles.id"), nullable=True, index=True)
    vehicle_id: Mapped[str | None] = mapped_column(ForeignKey("vehicles.id"), nullable=True)
    travel_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    direction: Mapped[Direction] = mapped_column(_enum(Direction), default=Direction.morning)
    status: Mapped[MatchStatus] = mapped_column(_enum(MatchStatus), default=MatchStatus.proposed, index=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)           # 0-100
    score_components: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # explainability
    constraint_results: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    capacity_used: Mapped[int] = mapped_column(Integer, default=0)
    engine_version: Mapped[str | None] = mapped_column(String(24), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


# ---------------------------------------------------------------- 12. match participants
class MatchParticipant(Base, Stamped):
    __tablename__ = "match_participants"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    match_group_id: Mapped[str] = mapped_column(ForeignKey("match_groups.id", ondelete="CASCADE"), index=True)
    commuter_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    request_id: Mapped[str | None] = mapped_column(ForeignKey("commute_requests.id"), nullable=True)
    response: Mapped[str] = mapped_column(String(16), default="pending")  # pending | accepted | rejected
    pickup_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    est_pickup_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    est_arrival_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    detour_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    __table_args__ = (UniqueConstraint("match_group_id", "commuter_id", name="uq_participant"),)


# ---------------------------------------------------------------- 13. routes and route stops
class Route(Base, Stamped):
    __tablename__ = "routes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    match_group_id: Mapped[str] = mapped_column(ForeignKey("match_groups.id", ondelete="CASCADE"), index=True)
    geometry_polyline: Mapped[str | None] = mapped_column(Text, nullable=True)   # encoded polyline from routing API
    total_distance_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_duration_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    direct_duration_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(24), default="simulated")  # google | mapbox | simulated
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=True)


class RouteStop(Base):
    __tablename__ = "route_stops"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    route_id: Mapped[str] = mapped_column(ForeignKey("routes.id", ondelete="CASCADE"), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    stop_type: Mapped[str] = mapped_column(String(12))  # start | pickup | dropoff
    commuter_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    label: Mapped[str | None] = mapped_column(String(160), nullable=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    eta: Mapped[time | None] = mapped_column(Time, nullable=True)
    __table_args__ = (UniqueConstraint("route_id", "sequence", name="uq_route_seq"),)


# ---------------------------------------------------------------- 14. driver assignments
class DriverAssignment(Base, Stamped):
    __tablename__ = "driver_assignments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    match_group_id: Mapped[str] = mapped_column(ForeignKey("match_groups.id", ondelete="CASCADE"), index=True)
    driver_id: Mapped[str] = mapped_column(ForeignKey("driver_profiles.id"), index=True)
    status: Mapped[AssignmentStatus] = mapped_column(_enum(AssignmentStatus), default=AssignmentStatus.offered)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------- 15. fare calculations
class FareCalculation(Base, Stamped):
    __tablename__ = "fare_calculations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    match_group_id: Mapped[str] = mapped_column(ForeignKey("match_groups.id", ondelete="CASCADE"), index=True)
    commuter_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    passenger_distance_km: Mapped[float] = mapped_column(Float)
    total_fare_inr: Mapped[float] = mapped_column(Numeric(10, 2))     # F_total of the shared ride
    share_inr: Mapped[float] = mapped_column(Numeric(10, 2))          # d_i / sum(d_j) * F_total
    solo_fare_inr: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    saving_inr: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    assumptions: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # tariff used; labelled simulated
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=True)


# ---------------------------------------------------------------- 16. payments
class Payment(Base, Stamped):
    __tablename__ = "payments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    fare_id: Mapped[str] = mapped_column(ForeignKey("fare_calculations.id", ondelete="CASCADE"), index=True)
    commuter_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    amount_inr: Mapped[float] = mapped_column(Numeric(10, 2))
    status: Mapped[PaymentStatus] = mapped_column(_enum(PaymentStatus), default=PaymentStatus.not_collected)
    method: Mapped[str | None] = mapped_column(String(24), nullable=True)
    provider_ref: Mapped[str | None] = mapped_column(String(80), nullable=True)


# ---------------------------------------------------------------- 17. notifications
class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(32), default="info")
    channel: Mapped[str] = mapped_column(String(16), default="in_app")  # in_app | fcm
    delivered: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


# ---------------------------------------------------------------- 18. emergency contacts
class EmergencyContact(Base, Stamped):
    __tablename__ = "emergency_contacts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(16))
    relationship_label: Mapped[str | None] = mapped_column(String(40), nullable=True)


# ---------------------------------------------------------------- 19. cancellation records
class CancellationRecord(Base):
    __tablename__ = "cancellation_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    trip_id: Mapped[str | None] = mapped_column(ForeignKey("trip_instances.id", ondelete="SET NULL"), nullable=True)
    match_group_id: Mapped[str | None] = mapped_column(ForeignKey("match_groups.id", ondelete="SET NULL"),
                                                       nullable=True)
    cancelled_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    cancelled_by_role: Mapped[Role] = mapped_column(_enum(Role))
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    kind: Mapped[str] = mapped_column(String(16), default="skip")  # skip | cancel | driver_cancel
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


# ---------------------------------------------------------------- 20. safety incidents
class SafetyIncident(Base, Stamped):
    __tablename__ = "safety_incidents"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    reported_by: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    match_group_id: Mapped[str | None] = mapped_column(ForeignKey("match_groups.id", ondelete="SET NULL"),
                                                       nullable=True)
    severity: Mapped[str] = mapped_column(String(12), default="medium")  # low | medium | high | critical
    category: Mapped[str] = mapped_column(String(40), default="other")
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)  # open | reviewing | resolved
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)


# ---------------------------------------------------------------- 21. admin actions (audit log)
class AdminAction(Base):
    __tablename__ = "admin_actions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    admin_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(48))
    target_type: Mapped[str] = mapped_column(String(32))
    target_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
