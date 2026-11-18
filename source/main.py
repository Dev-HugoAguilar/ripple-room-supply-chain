from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from simulation import simulate
from pathlib import Path

ROOT = Path(__file__).parent
app = FastAPI(title="The Ripple Room", version="0.1.0", docs_url="/api/docs")

class RunRequest(BaseModel):
    scenario_id: str = "asia"
    plan_id: str = "balanced"
    stock_days: int = Field(default=7, ge=2, le=24)
    disruption_days: int = Field(default=14, ge=3, le=24)
    horizon_days: int = Field(default=30, ge=20, le=45)

@app.get("/api/health")
def health():
    return {"status":"ok", "engine":"local-deterministic-simulation", "external_writes":False}

@app.post("/api/simulate")
def run_simulation(payload: RunRequest):
    try:
        return simulate(**payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

app.mount("/", StaticFiles(directory=ROOT, html=True), name="prototype")
