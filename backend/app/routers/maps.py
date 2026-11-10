"""Google Maps Platform integrations. Server credentials stay server-side."""
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException

from .. import config
from ..models import Role, User
from ..schemas import RoutePreviewIn
from ..security import require_role

router = APIRouter(prefix="/api/maps", tags=["maps"])
commuter_only = require_role(Role.commuter)
ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"


@router.post("/route")
async def preview_route(body: RoutePreviewIn, _: User = Depends(commuter_only)):
    """Return a real Google road route for the current commuter's chosen endpoints."""
    if not config.HAS_ROUTES_KEY:
        raise HTTPException(503, "Google Routes is not configured. Add GOOGLE_ROUTES_API_KEY to the local .env file.")

    payload = {
        "origin": {"location": {"latLng": {"latitude": body.origin.latitude,
                                                "longitude": body.origin.longitude}}},
        "destination": {"location": {"latLng": {"latitude": body.destination.latitude,
                                                     "longitude": body.destination.longitude}}},
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE",
        "computeAlternativeRoutes": False,
        "departureTime": datetime.now(timezone.utc).isoformat(),
        "languageCode": "en-IN",
        "regionCode": "IN",
        "units": "METRIC",
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": config.GOOGLE_ROUTES_API_KEY,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(ROUTES_URL, json=payload, headers=headers)
    except httpx.TimeoutException as exc:
        raise HTTPException(504, "Google Maps took too long to calculate this route. Try again.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Could not reach Google Maps to calculate this route.") from exc

    if response.status_code >= 400:
        # Avoid exposing Google's raw response or key-related diagnostics to clients.
        raise HTTPException(502, "Google Maps could not calculate this route. Check the Routes API key and billing setup.")
    try:
        route = response.json().get("routes", [])[0]
        duration = route["duration"]
        seconds = int(float(duration.removesuffix("s")))
        distance = int(route["distanceMeters"])
        polyline = route["polyline"]["encodedPolyline"]
    except (IndexError, KeyError, TypeError, ValueError):
        raise HTTPException(404, "Google Maps did not find a drivable route between these places.")

    return {
        "source": "google",
        "distance_meters": distance,
        "duration_seconds": seconds,
        "encoded_polyline": polyline,
        "traffic_aware": True,
        "calculated_at": datetime.now(timezone.utc).isoformat(),
    }
