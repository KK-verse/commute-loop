# Production matching engine (Phase 4, not built yet)

A standalone, testable Python package: geographic filter, time compatibility, road-route overlap, hard-constraint
validation, the 30/30/20/10/10 score, and constrained insertion route optimisation. It will take plain dataclasses in
and return proposals, with no FastAPI or database imports, so it can be tested and reused by a React Native client's backend.
The backend already has the tables (`match_groups`, `routes`, `route_stops`, ...) and the review lifecycle it will plug into. The admin Technology Demo is intentionally separate: `backend/app/technology_demo.py` runs deterministic, explicitly simulated judge scenarios without creating operational records. It is not a live matching service and does not replace the production engine described here.
