# The Ripple Room — integración en el portafolio

Sala interactiva de simulación de disrupciones en la cadena de suministro de
semiconductores, integrada en **Agentes y sistemas de decisión**.

- Ficha: `#/area/agentes/the-ripple-room`
- Demo servida: `dist/dashboards/the-ripple-room/index.html`
- Fuente editable: `source/`
- Entrada autónoma: `runtime/index.html` (copia de `source/prototipo_local.html`)

## Abrir en local

El sitio ya se sirve desde `dist/`:

```bash
cd dist
python -m http.server 8000 --bind 127.0.0.1
```

Abre `http://127.0.0.1:8000/dashboards/the-ripple-room/index.html` o la ficha del
portafolio.

## Composición

- Mapa regional centrado en el Pacífico: orígenes comerciales, México y países
  bajo presión en el mismo encuadre. La tarjeta de exposición expresa
  participación de valor comercial del escenario, no capacidad física.
- Dos bandas temporales alineadas: cobertura de inventario y demanda pendiente,
  cada una con su propia escala.
- Diagrama de trade-off servicio/costo con tres planes; los puntos se pueden
  seleccionar con puntero o teclado (Enter/Espacio).
- Tres escenarios, duración del choque e inventario de seguridad recalculan el
  mapa, las series, el trade-off y el resumen.
- Perspectivas de Operaciones, Abastecimiento y Finanzas como roles simulados
  deterministas.

## Estructura

- `source/index.html`, `styles.css`, `app.js`: fuente editable de la interfaz.
- `source/data.json`, `world.geojson`: snapshot de comercio y geometría local.
- `source/vendor/d3.min.js`: D3 local, sin CDN.
- `source/simulation.py`, `main.py`: motor y API local opcionales del prototipo.
- `source/build_preview.py`: genera la salida autónoma.
- `source/prototipo_local.html`: salida autónoma de referencia.
- `runtime/index.html`: entrada autónoma que se publica.
- `publicar.py`: copia `runtime/index.html` a `dist/dashboards/the-ripple-room/`.

La entrada autónoma embebe HTML, CSS, JavaScript, D3, datos y GeoJSON; por eso el
único archivo necesario en `dist` es `index.html`. No se requieren CDN, API,
Atlas ni credenciales.

## Regenerar la salida y publicar

```bash
cd dashboards/the-ripple-room/source
python build_preview.py
Copy-Item prototipo_local.html ..\runtime\index.html   # PowerShell
cd ../..
python dashboards/the-ripple-room/publicar.py
```

En el entorno integrado la página usa el **motor determinista del navegador**.
La API FastAPI opcional del prototipo sigue disponible en `source/main.py` para
quien la ejecute por separado en el puerto 8020; no está conectada al portafolio.

## Datos y límites

- Importaciones de México de HS 8542 por economía de origen, valores nominales en
  USD, UN Comtrade presentado por WITS, 2023–2024. Instantánea: 16 nov 2026.
- Los valores de comercio son observados y agregados; no son volumen físico,
  proveedores de una empresa, rutas logísticas, capacidad de sustitución ni
  pronóstico.
- La red de planta, demanda, inventario, capacidad, costos, interrupciones y
  rutas esquemáticas son supuestos sintéticos.
- Operaciones, Abastecimiento y Finanzas son roles simulados con reglas
  deterministas; no hay LLM conectado ni aprendizaje automático.
- `world.geojson` conserva anillos exteriores cerrados y en la orientación
  esférica que espera `d3-geo`; la geometría y los nombres de Natural Earth no se
  alteraron.
- La tarjeta de exposición del mapa usa participación de valor comercial; no mide
  volumen físico ni capacidad disponible.
- No hay escrituras persistentes ni despliegue.

## Archivos de referencia

La fuente original y las notas de datos se conservan en `source/README.md`,
`source/data.json` y `source/prototipo_local.html`.
