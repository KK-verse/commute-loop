"""Central configuration. Every secret comes from environment variables."""
import os
from pathlib import Path


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


BASE_DIR = Path(__file__).resolve().parent.parent
# Load a local project-root .env for direct uvicorn runs. Docker Compose also
# reads this file; environment variables already provided by the host win.
try:
    from dotenv import load_dotenv

    load_dotenv(BASE_DIR.parent / ".env", override=False)
except ImportError:
    pass

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'commuteloop.db'}")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-secret-change-me-dev-only-secret")
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "12"))
OTP_TEST_MODE = _bool("OTP_TEST_MODE", True)
OTP_TTL_MINUTES = 5
OTP_MAX_ATTEMPTS = 5
DEMO_MODE = _bool("DEMO_MODE", True)
ADMIN_PHONE = os.getenv("ADMIN_PHONE", "+919000000000")
ADMIN_NAME = os.getenv("ADMIN_NAME", "CommuteLoop Admin")
MAPS_PROVIDER = os.getenv("MAPS_PROVIDER", "google").lower()
GOOGLE_MAPS_BROWSER_KEY = os.getenv("GOOGLE_MAPS_BROWSER_KEY") or os.getenv("GOOGLE_MAPS_API_KEY", "")
GOOGLE_ROUTES_API_KEY = os.getenv("GOOGLE_ROUTES_API_KEY", "")
HAS_PLACES_KEY = bool(GOOGLE_MAPS_BROWSER_KEY) and MAPS_PROVIDER == "google"
HAS_ROUTES_KEY = bool(GOOGLE_ROUTES_API_KEY) and MAPS_PROVIDER == "google"
HAS_MAPS_KEY = HAS_PLACES_KEY or HAS_ROUTES_KEY
DOCUMENT_STORAGE_DIR = Path(os.getenv("DOCUMENT_STORAGE_DIR", str(BASE_DIR / "private_documents")))
FRONTEND_DIR = Path(os.getenv("FRONTEND_DIR", str(BASE_DIR.parent / "frontend")))
