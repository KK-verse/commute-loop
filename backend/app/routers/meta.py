from fastapi import APIRouter

from .. import config

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/config")
def public_config():
    """Tells the frontend which integrations are real and which are simulated. No secrets are returned."""
    return {
        "demo_mode": config.DEMO_MODE,
        "otp_test_mode": config.OTP_TEST_MODE,
        "maps": {
            "provider": config.MAPS_PROVIDER if config.HAS_MAPS_KEY else "none",
            "live": config.HAS_MAPS_KEY,
            "places_live": config.HAS_PLACES_KEY,
            "routes_live": config.HAS_ROUTES_KEY,
            # Browser keys are public by design; server-only Routes keys are never returned.
            "browser_key": config.GOOGLE_MAPS_BROWSER_KEY if config.HAS_PLACES_KEY else None,
        },
        "routing_is_simulated": not config.HAS_ROUTES_KEY,
        "notifications": {"in_app": True, "push_fcm": False},
        "cities": ["Bengaluru", "Hyderabad", "Delhi NCR"],
    }
