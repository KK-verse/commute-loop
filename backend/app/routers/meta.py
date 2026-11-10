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
        "maps": {"provider": config.MAPS_PROVIDER, "live": config.HAS_MAPS_KEY},
        "routing_is_simulated": not config.HAS_MAPS_KEY,
        "notifications": {"in_app": True, "push_fcm": False},
        "cities": ["Bengaluru", "Hyderabad", "Delhi NCR"],
    }
