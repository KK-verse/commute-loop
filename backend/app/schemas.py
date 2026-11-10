from datetime import date, time
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator


class OtpRequest(BaseModel):
    phone: str
    purpose: Literal["register", "login"]


class RegisterIn(BaseModel):
    phone: str
    otp: str = Field(min_length=6, max_length=6)
    full_name: str = Field(min_length=2, max_length=120)
    role: Literal["commuter", "driver"]
    email: EmailStr | None = None


class LoginIn(BaseModel):
    phone: str
    otp: str = Field(min_length=6, max_length=6)


class LocationIn(BaseModel):
    label: str = Field(min_length=2, max_length=160)
    address: str = Field(min_length=2, max_length=400)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    place_id: str | None = None
    pickup_label: str | None = None
    pickup_latitude: float | None = Field(default=None, ge=-90, le=90)
    pickup_longitude: float | None = Field(default=None, ge=-180, le=180)
    confirmed: bool = False
    accuracy_m: float | None = None
    geocode_source: Literal["google", "mapbox", "manual", "demo"] = "manual"


class CommuterOnboardingIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr | None = None
    company_name: str = Field(min_length=2, max_length=160)
    city: Literal["Bengaluru", "Hyderabad", "Delhi NCR"]
    home: LocationIn
    office: LocationIn
    arrival_time: time                       # office arrival deadline
    departure_time: time | None = None       # evening return departure
    working_days: list[int] = Field(min_length=1, max_length=7)
    preferred_vehicle: Literal["any", "bike", "auto", "taxi"] = "any"
    max_extra_minutes: int = Field(default=15, ge=0, le=90)
    prefers_fixed_group: bool = False
    accepts_alternative_matches: bool = True
    start_date: date | None = None
    end_date: date | None = None

    @field_validator("working_days")
    @classmethod
    def _days(cls, v):
        if any(d < 0 or d > 6 for d in v):
            raise ValueError("Days must be 0 (Monday) to 6 (Sunday).")
        return sorted(set(v))


class VehicleIn(BaseModel):
    registration_number: str = Field(min_length=6, max_length=20)
    category: Literal["bike", "auto", "taxi"]
    model: str | None = None
    permitted_passenger_capacity: int = Field(ge=1, le=8)
    insurance_provider: str | None = None
    insurance_policy_number: str | None = None
    insurance_expiry: date | None = None
    permit_number: str | None = None


class DriverOnboardingIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr | None = None
    city: Literal["Bengaluru", "Hyderabad", "Delhi NCR"]
    licence_number: str = Field(min_length=6, max_length=32)
    licence_expiry: date | None = None
    vehicle: VehicleIn
    service_areas: list[str] = Field(min_length=1)
    available_days: list[int] = Field(min_length=1)
    morning_start: time | None = None
    morning_end: time | None = None
    evening_start: time | None = None
    evening_end: time | None = None


class VerificationDecision(BaseModel):
    decision: Literal["approved", "rejected", "suspended", "pending"]
    note: str | None = Field(default=None, max_length=500)


class SkipIn(BaseModel):
    reason: str | None = Field(default=None, max_length=300)
