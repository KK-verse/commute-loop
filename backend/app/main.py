from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from .database import SessionLocal, get_db, init_db
from .demo import seed_demo
from .models import Role, User
from .routers import admin, auth, commuter, driver, maps, matches, meta, technology_demo
from .security import normalise_phone, require_role


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    with SessionLocal() as db:
        phone = normalise_phone(config.ADMIN_PHONE)
        if not db.scalar(select(User.id).where(User.phone == phone)):
            db.add(User(phone=phone, full_name=config.ADMIN_NAME, role=Role.admin, phone_verified=True,
                        onboarding_complete=True))
            db.commit()
        if config.DEMO_MODE:
            seed_demo(db)
    yield


app = FastAPI(title="CommuteLoop API", version="0.1.0", lifespan=lifespan)
for r in (meta.router, auth.router, commuter.router, driver.router, maps.router, admin.router, matches.router, technology_demo.router):
    app.include_router(r)


@app.post("/api/admin/demo/seed", tags=["admin"])
def reseed(_: User = Depends(require_role(Role.admin)), db: Session = Depends(get_db)):
    if not config.DEMO_MODE:
        return {"seeded": False, "reason": "Demo mode is off."}
    return seed_demo(db)


# Frontend (static PWA). API routes above take precedence.
if config.FRONTEND_DIR.exists():
    app.mount("/css", StaticFiles(directory=config.FRONTEND_DIR / "css"), name="css")
    app.mount("/js", StaticFiles(directory=config.FRONTEND_DIR / "js"), name="js")
    app.mount("/assets", StaticFiles(directory=config.FRONTEND_DIR / "assets"), name="assets") \
        if (config.FRONTEND_DIR / "assets").exists() else None

    @app.get("/manifest.webmanifest", include_in_schema=False)
    def manifest():
        return FileResponse(config.FRONTEND_DIR / "manifest.webmanifest", media_type="application/manifest+json")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        return FileResponse(config.FRONTEND_DIR / "index.html")
