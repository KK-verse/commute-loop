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

## Google Maps for local commute booking
Google Places autocomplete and Google Routes road previews are wired into commuter setup. Google returns the selected
place name, address, place ID and coordinates; the existing onboarding API saves them to `saved_locations` and
`commute_requests`, and the admin Requests page reads from those same records. A route is only labelled live when
the Routes API responds. Without keys, illustrative places and manual entry still work and no ETA is shown.

1. In Google Cloud Console, create a project, enable billing, and enable **Maps JavaScript API**, **Places API (New)**,
   and **Routes API**.
2. Create a browser key restricted to **Maps JavaScript API** and **Places API (New)**, with HTTP referrers
   `http://localhost:8000/*` and `http://127.0.0.1:8000/*`.
3. Create a second key restricted to **Routes API**. Keep this server key private; do not put it in frontend code or
   GitHub. For a deployed server, add an appropriate server-side restriction too.
4. Copy `.env.example` to `.env` in the project root and set `GOOGLE_MAPS_BROWSER_KEY` and
   `GOOGLE_ROUTES_API_KEY`. Restart the backend after changing it.

The browser key is public to the browser and therefore must have referrer and API restrictions. The Routes key is
read only by FastAPI. Both are omitted from Git by `.gitignore`; `/api/config` returns the restricted browser key
only when configured and never returns the Routes key.

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
- Production matching engine, multi-rider live route optimisation, production scoring and explainability panel (Phase 4). The judge demonstration uses a separate simulated graph and is not used for live matches.
- Live Google Places search and road-route preview are implemented but need the two restricted keys described above. Until configured, locations can be entered manually or chosen from clearly labelled illustrative areas.
- FCM push (notifications are stored in-app only), real SMS, payments, live GPS and trip start/complete, SOS,
  admin document viewer (uploads are stored privately; no public URL), reassignment tooling, reports.
- React Native client (web/PWA used instead; APIs are client-agnostic).
