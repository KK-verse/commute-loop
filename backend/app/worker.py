"""Background worker: extends recurring plans into future trip instances.

Run:  python -m app.worker          (loops hourly)
      python -m app.worker --once   (single pass, e.g. from cron)
Reminders / FCM push are added in the notifications phase.
"""
import sys
import time

from sqlalchemy import select

from .database import SessionLocal, init_db
from .models import RecurringPlan
from .services import generate_trip_instances


def run_once() -> int:
    created = 0
    with SessionLocal() as db:
        for plan in db.scalars(select(RecurringPlan).where(RecurringPlan.is_active.is_(True))):
            created += generate_trip_instances(db, plan)
        db.commit()
    return created


if __name__ == "__main__":
    init_db()
    if "--once" in sys.argv:
        print(f"generated {run_once()} trip instances")
    else:
        while True:
            print(f"generated {run_once()} trip instances", flush=True)
            time.sleep(3600)
