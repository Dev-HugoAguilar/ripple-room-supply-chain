"""Reproducible local scenario engine for The Ripple Room. No external writes."""
from __future__ import annotations
from pathlib import Path
import json
from typing import Literal

ROOT = Path(__file__).parent
DATA = json.loads((ROOT / "data.json").read_text(encoding="utf-8"))

SCENARIOS = {
    "asia": {"label": "Interrupción de abastecimiento en Asia", "kind": "region", "region": "Asia", "demand_lift": 0.0},
    "malaysia_vietnam": {"label": "Malasia + Vietnam fuera de servicio", "kind": "partners", "partners": ["Malasia", "Vietnam"], "demand_lift": 0.0},
    "demand": {"label": "Pico de demanda +30%", "kind": "demand", "demand_lift": 0.30},
}
PLANS = {
    "lean": {"label": "Contener costo", "recovery": 0.22, "surge": 0.12, "cost_weight": 0.55},
    "balanced": {"label": "Balanceado", "recovery": 0.52, "surge": 0.20, "cost_weight": 1.0},
    "continuity": {"label": "Proteger servicio", "recovery": 0.78, "surge": 0.30, "cost_weight": 1.8},
}

def _affected_share(scenario_id: str) -> float:
    scenario = SCENARIOS[scenario_id]
    total = float(DATA["totals_usd_millions"]["2024"])
    if scenario["kind"] == "region":
        affected = sum(p["usd_millions"]["2024"] for p in DATA["partners"] if p["region"] == scenario["region"])
    elif scenario["kind"] == "partners":
        affected = sum(p["usd_millions"]["2024"] for p in DATA["partners"] if p["name"] in scenario["partners"])
    else:
        return 0.30
    return min(0.95, affected / total)

def simulate(scenario_id: str = "asia", plan_id: str = "balanced", stock_days: int = 7, disruption_days: int = 14, horizon_days: int = 30) -> dict:
    if scenario_id not in SCENARIOS: raise ValueError("Escenario inválido")
    if plan_id not in PLANS: raise ValueError("Plan inválido")
    stock_days = max(2, min(24, int(stock_days)))
    disruption_days = max(3, min(24, int(disruption_days)))
    horizon_days = max(20, min(45, int(horizon_days)))
    scenario, plan = SCENARIOS[scenario_id], PLANS[plan_id]
    exposed = _affected_share(scenario_id)
    demand = 100.0 * (1 + scenario["demand_lift"])
    stock = stock_days * 100.0
    stock_cap = max(stock, 2_400.0)
    backlog = 0.0
    served_total = 0.0
    demand_total = 0.0
    stockout_days = 0
    expediting_units = 0.0
    days = []
    shock_start = 5
    shock_end = min(horizon_days, shock_start + disruption_days)
    for day in range(1, horizon_days + 1):
        in_shock = shock_start <= day < shock_end
        recovery_window = shock_end <= day < min(horizon_days + 1, shock_end + 9)
        if scenario_id == "demand":
            # Diversion/expedite creates bounded extra capacity under the synthetic scenario.
            supply = 100.0 + (demand - 100.0) * plan["recovery"] if in_shock else 100.0 + (demand - 100.0) * plan["surge"]
            extra = max(0.0, supply - 100.0)
        elif in_shock:
            lost = 100.0 * exposed
            recovery = lost * plan["recovery"]
            supply = 100.0 - lost + recovery
            extra = recovery
        elif recovery_window:
            supply = 100.0 * (1 + plan["surge"])
            extra = supply - 100.0
        else:
            supply = 100.0
            extra = 0.0
        expediting_units += extra
        available = stock + supply
        served = min(demand + backlog, available)
        unmet = max(0.0, demand + backlog - served)
        # Backlog is old demand; fulfilled volume beyond today's demand clears it.
        backlog = max(0.0, backlog + demand - served)
        stock = min(stock_cap, max(0.0, available - min(demand, served)))
        if served < demand - 1e-8: stockout_days += 1
        served_total += min(demand, served)
        demand_total += demand
        days.append({"day": day, "stock_units": round(stock, 1), "backlog_units": round(backlog, 1), "cover_days": round(stock / demand, 2), "supply_units": round(supply, 1), "demand_units": round(demand, 1), "shock": in_shock, "recovery": recovery_window})
    service = 100.0 * served_total / demand_total if demand_total else 100.0
    delayed = backlog
    # Cost is a scenario index, never a currency estimate.
    cost_index = 100.0 + expediting_units * plan["cost_weight"] / max(1, horizon_days) * 0.22
    return {
        "scenario_id": scenario_id, "scenario_label": scenario["label"], "plan_id": plan_id,
        "plan_label": plan["label"], "horizon_days": horizon_days, "stock_days": stock_days,
        "disruption_days": disruption_days, "affected_trade_value_share": round(exposed, 4),
        "service_level_pct": round(service, 1), "stockout_days": stockout_days,
        "delayed_demand_index": round(delayed, 1), "ending_cover_days": round(stock / demand, 1),
        "response_cost_index": round(cost_index, 1), "daily": days,
        "assumptions": "Demanda, inventario, capacidades, lead times y costos son índices sintéticos. La participación de origen se basa en valor comercial UN Comtrade 2024, no en volumen ni capacidad disponible.",
    }
