# CommuteLoop: Your route. Your routine. One shared ride.

Phase 1-2 foundation: architecture, 21-table schema (PostgreSQL + PostGIS), phone-OTP auth with role-based access,
commuter and driver onboarding, recurring trip generation, match review lifecycle, and the three role dashboards.

## Layout
- `backend/` FastAPI app (`app/`), pytest suite (`tests/`), background worker (`app/worker.py`)
- `frontend/` responsive web/PWA (no build step). Same APIs a React Native client will use later
- `db/postgis_extras.sql` geography columns + GiST indexes, applied automatically on PostgreSQL
- `matching_engine/` reserved for Phase 4 (separate from frontend and API)

## Run (no Docker, SQLite dev database)
```
cd backend && pip install -r requirements.txt
uvicorn app.main:app --port 8000        # open http://localhost:8000
python -m pytest tests -q
```
## Run with PostgreSQL + PostGIS
```
cp .env.example .env && docker compose up --build
```
## Signing in during development
OTP is in **TEST mode** (no SMS provider): the code is shown on screen, labelled TEST OTP. Set `OTP_TEST_MODE=false`
and wire an SMS provider in `routers/auth.py` for real use.
Demo mode seeds clearly labelled **simulated** Bengaluru ORR data:
- Admin: `9000000000` (ADMIN_PHONE)
- Commuters: `9000000101`, `9000000102`, `9000000103`; approved driver: `9000000201`; pending driver: `9000000202`
Try it: admin approves the demo match (Match Management) -> commuters accept (Find a Match) -> driver accepts (Ride Requests) -> trips become CONFIRMED.

## Innovation challenge judge demonstration
The admin navigation includes **Technology Demo**, a separate module for a three-rider shared auto and a four-rider shared cab. It runs a deterministic backend insertion search against labelled Bengaluru road-graph fixtures, returns the selected route, hard-constraint checks, component score, detours and distance-proportional fare split, and includes incompatible-request and capacity-rejection runs. Fixture data is not written to operational tables.

This demonstration is deliberately labelled **simulated**: the repository has no live Google Maps/Mapbox routing adapter. Its route times, road segments and taxi tariff are illustrative inputs, not measured traffic or live fare quotes. The general production matching engine remains a separate future phase.

Sign in with the development admin number `9000000000`; test mode displays the OTP in the login flow. Then open **Technology Demo** in the admin sidebar.

## Not built yet (reported honestly)
- Production matching engine, live route optimisation, production scoring and explainability panel (Phase 4). The judge demonstration uses a separate simulated graph and is not used for live matches.
- Google Places / Mapbox autocomplete, geocoding and road routing: needs API keys. Until then locations are picked from
  illustrative places or entered manually, maps are schematic, and nothing shows a fake road route or ETA.
- FCM push (notifications are stored in-app only), real SMS, payments, live GPS and trip start/complete, SOS,
  admin document viewer (uploads are stored privately; no public URL), reassignment tooling, reports.
- React Native client (web/PWA used instead; APIs are client-agnostic).
