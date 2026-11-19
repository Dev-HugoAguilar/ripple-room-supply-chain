"""Invariantes deterministas del motor de escenarios de The Ripple Room.

Los valores esperados se derivan de source/simulation.py, no de supuestos
externos: cada aserción corresponde a una regla escrita en ese archivo.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
RUTA_SIMULACION = RAIZ / "source" / "simulation.py"


def _cargar_simulacion():
    especificacion = importlib.util.spec_from_file_location("ripple_simulation", RUTA_SIMULACION)
    modulo = importlib.util.module_from_spec(especificacion)
    especificacion.loader.exec_module(modulo)
    return modulo


simulacion = _cargar_simulacion()
simulate = simulacion.simulate
SCENARIOS = tuple(simulacion.SCENARIOS)
PLANS = tuple(simulacion.PLANS)


def test_misma_entrada_mismo_resultado():
    primero = simulate("asia", "balanced")
    segundo = simulate("asia", "balanced")
    assert primero == segundo
    assert primero["daily"] == segundo["daily"]
    assert primero["service_level_pct"] == segundo["service_level_pct"]
    for escenario in SCENARIOS:
        for plan in PLANS:
            assert simulate(escenario, plan) == simulate(escenario, plan)


def test_demanda_total_igual_a_horizonte_por_demanda_diaria():
    for escenario in SCENARIOS:
        for horizonte in (20, 30, 45):
            resultado = simulate(escenario, "balanced", horizon_days=horizonte)
            diario = resultado["daily"]
            assert len(diario) == horizonte
            demanda = diario[0]["demand_units"]
            esperada = 100.0 * (1 + simulacion.SCENARIOS[escenario]["demand_lift"])
            assert demanda == pytest.approx(esperada, abs=0.1)
            assert all(day["demand_units"] == demanda for day in diario)
            assert sum(day["demand_units"] for day in diario) == pytest.approx(
                esperada * horizonte, abs=0.1
            )


def test_ventana_de_choque_y_recuperacion():
    for interrupcion in (3, 7, 14, 24):
        for horizonte in (20, 30, 45):
            diario = simulate(
                "asia", "balanced", disruption_days=interrupcion, horizon_days=horizonte
            )["daily"]
            shock_esperado = min(interrupcion, horizonte - 5)
            dias_choque = [day["day"] for day in diario if day["shock"]]
            assert dias_choque == list(range(5, 5 + shock_esperado))
            fin_choque = min(horizonte, 5 + interrupcion)
            dias_recuperacion = [day["day"] for day in diario if day["recovery"]]
            assert dias_recuperacion == [
                dia for dia in range(fin_choque, min(horizonte + 1, fin_choque + 9))
            ]


def test_suministro_durante_el_choque_sigue_la_regla_del_plan():
    for escenario in ("asia", "malaysia_vietnam"):
        for plan in PLANS:
            resultado = simulate(escenario, plan, disruption_days=14, horizon_days=30)
            expuesta = resultado["affected_trade_value_share"]
            recuperacion = simulacion.PLANS[plan]["recovery"]
            esperado = round(100.0 - 100.0 * expuesta + 100.0 * expuesta * recuperacion, 1)
            for day in resultado["daily"]:
                if day["shock"]:
                    assert day["supply_units"] == pytest.approx(esperado, abs=0.1)


def test_nivel_de_servicio_acotado_y_faltantes_contados():
    for escenario in SCENARIOS:
        for plan in PLANS:
            for stock_days in (2, 7, 24):
                resultado = simulate(escenario, plan, stock_days=stock_days)
                assert 0.0 <= resultado["service_level_pct"] <= 100.0
                assert 0 <= resultado["stockout_days"] <= resultado["horizon_days"]
                assert all(day["stock_units"] >= 0 for day in resultado["daily"])
                assert all(day["cover_days"] >= 0 for day in resultado["daily"])


def test_parametros_fuera_de_rango_se_recortan():
    assert simulate("asia", "balanced", stock_days=1) == simulate(
        "asia", "balanced", stock_days=2
    )
    assert simulate("asia", "balanced", stock_days=99) == simulate(
        "asia", "balanced", stock_days=24
    )
    assert simulate("asia", "balanced", horizon_days=10) == simulate(
        "asia", "balanced", horizon_days=20
    )
    assert simulate("asia", "balanced", disruption_days=100) == simulate(
        "asia", "balanced", disruption_days=24
    )


def test_servicio_no_baja_al_aumentar_el_inventario():
    for escenario in SCENARIOS:
        for plan in PLANS:
            servicios = [
                simulate(escenario, plan, stock_days=dias)["service_level_pct"]
                for dias in range(2, 25)
            ]
            assert all(
                anterior <= siguiente
                for anterior, siguiente in zip(servicios, servicios[1:])
            ), (escenario, plan, servicios)


def test_conservacion_de_inventario_sin_faltantes():
    for escenario, plan in (("asia", "balanced"), ("asia", "continuity")):
        resultado = simulate(escenario, plan)
        assert resultado["stockout_days"] == 0
        diario = resultado["daily"]
        for anterior, actual in zip(diario, diario[1:]):
            esperado = (
                anterior["stock_units"] + actual["supply_units"] - actual["demand_units"]
            )
            assert actual["stock_units"] == pytest.approx(esperado, abs=0.15)
        assert resultado["ending_cover_days"] == pytest.approx(
            diario[-1]["stock_units"] / diario[-1]["demand_units"], abs=0.1
        )


def test_entradas_invalidas_fallan():
    with pytest.raises(ValueError):
        simulate("escenario-inexistente")
    with pytest.raises(ValueError):
        simulate("asia", "plan-inexistente")
