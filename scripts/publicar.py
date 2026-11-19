#!/usr/bin/env python3
"""Publica el prototipo autocontenido en app/index.html.

Copia exactamente source/prototipo_local.html y reporta tamaño y SHA-256 de
origen y destino. No modifica el contenido.
"""
from __future__ import annotations

import hashlib
import shutil
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
ORIGEN = RAIZ / "source" / "prototipo_local.html"
DESTINO = RAIZ / "app" / "index.html"


def sha256(ruta: Path) -> str:
    return hashlib.sha256(ruta.read_bytes()).hexdigest()


def main() -> int:
    if not ORIGEN.is_file():
        print(f"ERROR: falta el prototipo de origen: {ORIGEN}")
        print("Ejecuta antes: python source/build_preview.py")
        return 1
    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ORIGEN, DESTINO)
    origen_bytes, destino_bytes = ORIGEN.stat().st_size, DESTINO.stat().st_size
    origen_sha, destino_sha = sha256(ORIGEN), sha256(DESTINO)
    print(f"Origen : {ORIGEN}")
    print(f"         {origen_bytes:,} bytes · sha256={origen_sha}")
    print(f"Destino: {DESTINO}")
    print(f"         {destino_bytes:,} bytes · sha256={destino_sha}")
    if origen_sha != destino_sha or origen_bytes != destino_bytes:
        print("ERROR: la copia no coincide con el origen")
        return 1
    print("Publicación OK: app/index.html reproduce source/prototipo_local.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
