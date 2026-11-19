# Scripts de publicación

La demo publicada es `app/index.html`. El generador histórico
(`source/build_preview.py`) escribe `source/prototipo_local.html`; este directorio
añade el paso explícito que faltaba para que la demo publicada sea exactamente ese
prototipo, más su comprobación de paridad.

## Orden de ejecución

```bash
# desde la raíz del repositorio

# 1. Simular: el motor determinista vive en source/simulation.py
#    (API local opcional: uvicorn main:app --app-dir source --port 8020)
python -m pytest tests -q

# 2. Generar el prototipo autocontenido
python source/build_preview.py         # -> source/prototipo_local.html

# 3. Publicar la demo
python scripts/publicar.py             # -> app/index.html (copia + bytes + SHA-256)

# 4. Verificar la paridad
python scripts/verificar_paridad.py    # falla si app/index.html difiere del origen
```

## Qué hace cada script

| Script | Entrada | Salida |
|---|---|---|
| `source/build_preview.py` | `source/index.html`, `styles.css`, `app.js`, `data.json`, `world.geojson`, `vendor/d3.min.js` | `source/prototipo_local.html` |
| `scripts/publicar.py` | `source/prototipo_local.html` | `app/index.html`; imprime bytes y SHA-256 de origen y destino |
| `scripts/verificar_paridad.py` | ambos archivos | código 0 si coinciden byte a byte; código 1 y diagnóstico si no |

`publicar.py` falla si falta el prototipo de origen: no genera un `app/index.html`
parcial ni vacío. `verificar_paridad.py` falla si falta cualquiera de los dos
archivos, si los tamaños difieren o si los hashes no coinciden.

## Pruebas

`tests/test_simulacion.py` importa `source/simulation.py` con `importlib` desde la
ruta del archivo (no requiere instalar el repositorio ni depender del directorio
de trabajo) y comprueba invariantes deterministas del motor: misma entrada →
mismo resultado, conservación de la demanda y del inventario sin faltantes,
ventana de choque/recuperación, recortes de parámetros, monotonía del servicio
frente al inventario y errores de entrada.

```bash
python -m pytest tests -q
```

No hay build de Node ni servicio externo: la demo publicada es un HTML estático
autocontenido.
