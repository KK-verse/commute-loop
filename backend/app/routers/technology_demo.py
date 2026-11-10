from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..models import Role, User
from ..security import require_role
from ..technology_demo import list_scenarios, run_scenario

router = APIRouter(prefix="/api/admin/technology-demo", tags=["admin", "technology-demo"])


class DemoRunIn(BaseModel):
    scenario_id: Literal["auto", "cab"]
    mode: Literal["standard", "incompatible", "capacity"] = "standard"
    weights: dict[str, float] | None = None


@router.get("/scenarios")
def scenarios(_: User = Depends(require_role(Role.admin))):
    return list_scenarios()


@router.post("/run")
def run(body: DemoRunIn, _: User = Depends(require_role(Role.admin))):
    try:
        return run_scenario(body.scenario_id, body.mode, body.weights)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
