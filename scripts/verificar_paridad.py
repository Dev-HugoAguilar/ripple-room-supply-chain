#!/usr/bin/env python3
"""Verifica que la demo publicada coincida byte a byte con el prototipo fuente."""
from __future__ import annotations

import hashlib
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
ORIGEN = RAIZ / "source" / "prototipo_local.html"
DESTINO = RAIZ / "app" / "index.html"


def sha256(ruta: Path) -> str:
    return hashlib.sha256(ruta.read_bytes()).hexdigest()


def main() -> int:
    faltantes = [ruta for ruta in (ORIGEN, DESTINO) if not ruta.is_file()]
    if faltantes:
        for ruta in faltantes:
            print(f"ERROR: falta {ruta}")
        return 1
    origen, destino = ORIGEN.read_bytes(), DESTINO.read_bytes()
    if origen == destino:
        print(f"Paridad OK: {len(origen):,} bytes · sha256={sha256(ORIGEN)}")
        print(f"  source/prototipo_local.html == app/index.html")
        return 0
    print("ERROR: app/index.html no coincide con source/prototipo_local.html")
    print(f"  origen : {len(origen):,} bytes · sha256={sha256(ORIGEN)}")
    print(f"  destino: {len(destino):,} bytes · sha256={sha256(DESTINO)}")
    if len(origen) == len(destino):
        desajuste = next(i for i, (a, b) in enumerate(zip(origen, destino)) if a != b)
        print(f"  primer byte distinto en el offset {desajuste:,}")
    print("Ejecuta: python scripts/publicar.py")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
