import os, tempfile
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/t.db"
os.environ["DEMO_MODE"] = "true"
os.environ["OTP_TEST_MODE"] = "true"

import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="module")
def c():
    with TestClient(app) as client:
        yield client


def signin(c, phone, name=None, role=None):
    purpose = "register" if role else "login"
    otp = c.post("/api/auth/request-otp", json={"phone": phone, "purpose": purpose}).json()["test_otp"]
    body = {"phone": phone, "otp": otp}
    if role:
        body.update(full_name=name, role=role)
    r = c.post(f"/api/auth/{purpose}", json=body)
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}, r.json()["user"]


LOC_H = dict(label="Marathahalli", address="Marathahalli, Bengaluru", latitude=12.9569, longitude=77.7011, confirmed=True, geocode_source="demo")
LOC_O = dict(label="Embassy TechVillage", address="ORR, Bengaluru", latitude=12.923, longitude=77.687, confirmed=True, geocode_source="demo")
COMMUTER = dict(full_name="Test Rider", company_name="Acme", city="Bengaluru", home=LOC_H, office=LOC_O, arrival_time="09:00:00",
                departure_time="18:00:00", working_days=[0, 1, 2, 3, 4], preferred_vehicle="auto", max_extra_minutes=15)


def test_otp_wrong_and_unknown(c):
    assert c.post("/api/auth/request-otp", json={"phone": "9111111111", "purpose": "login"}).status_code == 404
    c.post("/api/auth/request-otp", json={"phone": "9111111111", "purpose": "register"})
    r = c.post("/api/auth/register", json={"phone": "9111111111", "otp": "000000", "full_name": "X Y", "role": "commuter"})
    assert r.status_code == 400


def test_register_creates_records_and_profile_persists(c):
    h, u = signin(c, "9222222222", "Test Rider", "commuter")
    assert u["role"] == "commuter" and not u["onboarding_complete"]
    assert c.put("/api/commuter/onboarding", json=COMMUTER, headers=h).status_code == 200
    c.post("/api/auth/logout", headers=h)
    assert c.get("/api/auth/me", headers=h).status_code == 401        # logout revokes the session
    h2, u2 = signin(c, "9222222222")                                    # sign in again
    assert u2["onboarding_complete"]
    p = c.get("/api/commuter/profile", headers=h2).json()
    assert p["company_name"] == "Acme" and p["home"]["label"] == "Marathahalli" and p["working_days"] == [0, 1, 2, 3, 4]


def test_role_isolation(c):
    h, _ = signin(c, "9333333333", "Rider Two", "commuter")
    assert c.get("/api/admin/overview", headers=h).status_code == 403
    assert c.get("/api/driver/dashboard", headers=h).status_code == 403
    assert c.get("/api/commuter/dashboard").status_code == 401


def test_recurring_trips_and_skip_one_day(c):
    h, _ = signin(c, "9444444444", "Rider Three", "commuter")
    c.put("/api/commuter/onboarding", json=COMMUTER, headers=h)
    trips = c.get("/api/commuter/trips", headers=h).json()
    assert trips and all(date_wd in range(5) for date_wd in [__import__("datetime").date.fromisoformat(t["date"]).weekday() for t in trips])
    assert {t["direction"] for t in trips} == {"morning", "evening"}
    first = trips[0]
    assert c.post(f"/api/commuter/trips/{first['id']}/skip", json={}, headers=h).json()["plan_still_active"]
    after = c.get("/api/commuter/trips", headers=h).json()
    assert [t["status"] for t in after if t["id"] == first["id"]] == ["SKIPPED"]
    assert sum(t["status"] != "SKIPPED" for t in after) == len(trips) - 1
    assert all(p["is_active"] for p in c.get("/api/commuter/schedule", headers=h).json())


def test_driver_gating_and_capacity_rules(c):
    h, _ = signin(c, "9555555555", "Driver One", "driver")
    body = dict(full_name="Driver One", city="Bengaluru", licence_number="KA0120200001234",
                vehicle=dict(registration_number="KA05XY9999", category="auto", permitted_passenger_capacity=5),
                service_areas=["Bellandur"], available_days=[0, 1, 2])
    assert c.put("/api/driver/onboarding", json=body, headers=h).status_code == 422   # 5 seats on an auto is rejected
    body["vehicle"]["permitted_passenger_capacity"] = 3
    assert c.put("/api/driver/onboarding", json=body, headers=h).status_code == 200
    d = c.get("/api/driver/dashboard", headers=h).json()
    assert d["verification_status"] == "pending" and not d["can_receive_assignments"] and d["offers"] == []
    assert c.get("/api/driver/requests", headers=h).json() == []


def test_admin_overview_separates_demo(c):
    h, _ = signin(c, "9000000000")
    o = c.get("/api/admin/overview", headers=h).json()
    m = o["metrics"]["total_commuters"]
    assert m["demo"] == 3 and m["total"] == m["real"] + m["demo"]
    assert o["metrics"]["proposed_matches"]["demo"] == 1


def test_match_lifecycle_demo(c):
    """admin approves -> riders + driver accept -> CONFIRMED. Nothing is confirmed before everyone answers."""
    adm, _ = signin(c, "9000000000")
    g = c.get("/api/admin/matches", headers=adm).json()[0]
    riders = [signin(c, p)[0] for p in ("+919000000101", "+919000000102", "+919000000103")]
    drv, _ = signin(c, "+919000000201")
    assert c.get("/api/commuter/proposals", headers=riders[0]).json() == []     # hidden until admin approves
    assert c.get("/api/driver/requests", headers=drv).json() == []
    assert c.post(f"/api/admin/matches/{g['id']}/decision", json={"decision": "approve"}, headers=adm).status_code == 200
    prop = c.get("/api/commuter/proposals", headers=riders[0]).json()[0]
    shares = [p["fare_inr"] for p in prop["participants"]]
    assert round(sum(shares), 2) == 144.0 and shares == [78.55, 52.36, 13.09]     # deck's worked example
    for r in riders:
        assert c.post(f"/api/commuter/proposals/{g['id']}/respond", json={"accept": True}, headers=r).json()["group_status"] == "approved"
    req = c.get("/api/driver/requests", headers=drv).json()[0]
    assert c.post(f"/api/driver/assignments/{req['id']}/accept", headers=drv).json()["group_status"] == "confirmed"
    t = c.get("/api/commuter/trips", headers=riders[0]).json()
    assert any(x["status"] == "CONFIRMED" for x in t)
