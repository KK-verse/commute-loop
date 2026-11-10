"""SIMULATED demo scenario: Bengaluru Outer Ring Road corridor.

Everything created here has is_demo=True and fake +91 90000-0xxxx numbers. Coordinates are illustrative
approximations, the route is a simulated straight sequence (NOT a road route), and fares use the illustrative
tariff from the project deck. None of it is live data, and the UI labels it as simulated.
"""
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (AssignmentStatus, CommutePreference, CommuteRequest, CommuterProfile, Direction, DriverAssignment,
                      DriverProfile, FareCalculation, LocationKind, MatchGroup, MatchParticipant, MatchStatus,
                      Payment, PaymentStatus, RecurringPlan, RequestStatus, Role, Route, RouteStop, SavedLocation,
                      TripInstance, TripStatus, User, Vehicle, VehicleType, Verification)
from .services import auto_fare, distance_proportional_fares, generate_trip_instances, pattern_for

OFFICE = dict(label="Embassy TechVillage (simulated office)", address="ORR Tech Park, Devarabisanahalli, Bengaluru",
              latitude=12.9230, longitude=77.6870)
RIDERS = [  # name, phone, area, lat, lng, km on the shared auto route (deck example: 6 / 4 / 1)
    ("Demo Commuter A", "+919000000101", "Marathahalli", 12.9569, 77.7011, 6.0),
    ("Demo Commuter B", "+919000000102", "Bellandur", 12.9304, 77.6784, 4.0),
    ("Demo Commuter C", "+919000000103", "Kadubeesanahalli", 12.9366, 77.6906, 1.0),
]
DEMO_DRIVERS = [("Demo Driver (approved)", "+919000000201", Verification.approved, "KA01DEMO0001"),
                ("Demo Driver (pending)", "+919000000202", Verification.pending, "KA01DEMO0002")]


def seed_demo(db: Session) -> dict:
    if db.scalar(select(User.id).where(User.phone == RIDERS[0][1])):
        return {"seeded": False, "reason": "Demo data already present."}
    start = date.today()
    users = []
    req_ids = []
    for name, phone, area, lat, lng, _km in RIDERS:
        u = User(phone=phone, full_name=name, role=Role.commuter, phone_verified=True, is_demo=True,
                 onboarding_complete=True)
        db.add(u)
        db.flush()
        db.add(CommuterProfile(user_id=u.id, company_name="Simulated Tech Co.", city="Bengaluru"))
        home = SavedLocation(user_id=u.id, kind=LocationKind.home, label=f"{area} (simulated)",
                             address=f"{area}, Bengaluru", latitude=lat, longitude=lng, confirmed=True,
                             geocode_source="demo", pickup_label=f"{area} main road stop")
        office = SavedLocation(user_id=u.id, kind=LocationKind.office, confirmed=True, geocode_source="demo",
                               **OFFICE)
        db.add_all([home, office, CommutePreference(user_id=u.id, preferred_vehicle="auto", max_extra_minutes=15)])
        db.flush()
        req = CommuteRequest(commuter_id=u.id, home_location_id=home.id, office_location_id=office.id,
                             arrival_deadline=time(9, 0), evening_departure_time=time(18, 0),
                             travel_days=[0, 1, 2, 3, 4], preferred_vehicle="auto", max_extra_minutes=15,
                             status=RequestStatus.active, is_demo=True)
        db.add(req)
        db.flush()
        for direction, tt in ((Direction.morning, time(9, 0)), (Direction.evening, time(18, 0))):
            plan = RecurringPlan(request_id=req.id, commuter_id=u.id, direction=direction,
                                 pattern=pattern_for([0, 1, 2, 3, 4]), weekdays=[0, 1, 2, 3, 4], target_time=tt,
                                 start_date=start)
            db.add(plan)
            db.flush()
            generate_trip_instances(db, plan, is_demo=True)
        users.append(u)

    driver_profiles = []
    for name, phone, status, reg in DEMO_DRIVERS:
        du = User(phone=phone, full_name=name, role=Role.driver, phone_verified=True, is_demo=True,
                  onboarding_complete=True)
        db.add(du)
        db.flush()
        dp = DriverProfile(user_id=du.id, licence_number="KA0120200000000", city="Bengaluru",
                           service_areas=[{"name": "Marathahalli"}, {"name": "Bellandur"}],
                           available_days=[0, 1, 2, 3, 4], morning_start=time(7, 30), morning_end=time(10, 0),
                           evening_start=time(17, 30), evening_end=time(20, 0), verification_status=status)
        db.add(dp)
        db.flush()
        db.add(Vehicle(driver_id=dp.id, registration_number=reg, category=VehicleType.auto, model="Simulated auto",
                       permitted_passenger_capacity=3, eligibility_status=status))
        driver_profiles.append(dp)
    db.flush()

    # One SIMULATED proposed match for the demo day, so every dashboard has something real-shaped to show.
    approved = driver_profiles[0]
    veh = db.scalar(select(Vehicle).where(Vehicle.driver_id == approved.id))
    d = start
    while d.weekday() > 4:
        d += timedelta(days=1)
    group = MatchGroup(driver_id=approved.id, vehicle_id=veh.id, travel_date=d, direction=Direction.morning,
                       status=MatchStatus.proposed, score=None, capacity_used=3, is_demo=True,
                       engine_version="demo-seed",
                       explanation="SIMULATED grouping for demonstration. The scoring engine arrives in the next "
                                   "phase, so no match score is shown.")
    db.add(group)
    db.flush()
    route = Route(match_group_id=group.id, source="simulated", is_simulated=True, total_distance_m=8000,
                  total_duration_s=28 * 60, direct_duration_s=22 * 60)
    db.add(route)
    db.flush()
    pickup_times = [time(8, 27), time(8, 38), time(8, 45)]
    seq = 0
    for i, (u, r) in enumerate(zip(users, RIDERS)):
        db.add(MatchParticipant(match_group_id=group.id, commuter_id=u.id, pickup_order=i + 1,
                                est_pickup_time=pickup_times[i], est_arrival_time=time(8, 55), response="pending"))
        db.add(RouteStop(route_id=route.id, sequence=seq, stop_type="pickup", commuter_id=u.id, label=r[2],
                         latitude=r[3], longitude=r[4], eta=pickup_times[i]))
        seq += 1
        trip = db.scalar(select(TripInstance).where(TripInstance.commuter_id == u.id, TripInstance.travel_date == d,
                                                    TripInstance.direction == Direction.morning))
        if trip:
            trip.status, trip.match_group_id = TripStatus.proposed, group.id
    db.add(RouteStop(route_id=route.id, sequence=seq, stop_type="dropoff", label=OFFICE["label"],
                     latitude=OFFICE["latitude"], longitude=OFFICE["longitude"], eta=time(8, 55)))
    db.add(DriverAssignment(match_group_id=group.id, driver_id=approved.id, status=AssignmentStatus.offered))

    total_fare = auto_fare(8.0)  # 36 + 6 x 18 = 144 (illustrative tariff from the deck)
    shares = distance_proportional_fares([r[5] for r in RIDERS], total_fare)
    for u, r, share in zip(users, RIDERS, shares):
        solo = auto_fare(r[5])
        fare = FareCalculation(match_group_id=group.id, commuter_id=u.id, passenger_distance_km=r[5],
                               total_fare_inr=total_fare, share_inr=share, solo_fare_inr=solo,
                               saving_inr=round(solo - share, 2), is_simulated=True,
                               assumptions={"tariff": "Rs 36 for first 2 km + Rs 18/km (illustrative)",
                                            "shared_route_km": 8.0, "label": "SIMULATED"})
        db.add(fare)
        db.flush()
        db.add(Payment(fare_id=fare.id, commuter_id=u.id, amount_inr=share, status=PaymentStatus.not_collected))
    db.commit()
    return {"seeded": True, "commuters": len(users), "drivers": len(driver_profiles), "shared_fare_inr": total_fare}
