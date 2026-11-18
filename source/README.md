# The Ripple Room

Prototipo local de una sala interactiva de simulación de disrupciones de suministro con roles de agentes simulados.

## Abrir

- `prototipo_local.html`: demo independiente, sin instalación ni conexión de red.
- API local opcional: `python -m pip install -r requirements.txt` y `uvicorn main:app --app-dir . --reload --port 8020`; después abre `http://127.0.0.1:8020`.
- En la API, `POST /api/simulate` ejecuta el mismo motor determinista en Python. Si se abre el HTML directamente, el navegador usa su motor local de respaldo.
- Integración en el portafolio: la demo publicada usa el motor determinista del navegador y no requiere instalar nada. El motor Python solo se activa al servir la página en el puerto `8020` o al añadir `?api=1`; en cualquier otro caso la página no intenta llamar a `/api/simulate`.

## Datos reales

Importaciones reportadas por México de HS 8542 (circuitos integrados electrónicos y microestructuras), valores nominales en miles de USD, convertidos a millones de USD. La selección por socio para 2023 y 2024 proviene de WITS/UN Comtrade; la lista de socios se limita a los principales mostrados por la fuente consultada. La categoría “Other Asia, nes” se conserva como agregado sin punto geográfico exacto.

- [México, importaciones 2023, HS 8542 — WITS/UN Comtrade](https://wits.worldbank.org/trade/comtrade/en/country/MEX/year/2023/tradeflow/Imports/partner/ALL/product/8542)
- [México, importaciones 2024, HS 8542 — WITS/UN Comtrade](https://wits.worldbank.org/trade/comtrade/en/country/MEX/year/2024/tradeflow/Imports/partner/ALL/product/8542)
- [Documentación API de UN Comtrade](https://comtradeplus.un.org/en/api-docs)
- Instantánea consultada: 16 de noviembre de 2026. El corte 2024 se eligió para la demo por tener tabla de socios completa y legible.

## Qué es simulación

La red de empresa (plantas, demanda, inventario, capacidades de respuesta y conexiones dentro de México), el choque y costos son parámetros ilustrativos. El valor comercial por economía solo informa el peso relativo del origen; no representa volumen físico, proveedores específicos, rutas logísticas, capacidad de reemplazo ni pronóstico. Los roles de Operaciones, Abastecimiento y Finanzas y sus recomendaciones son deterministas; no hay LLM conectado. Ninguna acción sale del navegador/API local ni se persiste.

La capa cartográfica Natural Earth muestra límites nacionales de referencia en una proyección centrada en el Pacífico; sus anillos se serializan cerrados y con la orientación esférica que espera d3-geo, para que D3 dibuje los países y no sus complementos. Los arcos son conexiones comerciales origen–México; no son rutas observadas. La tarjeta del mapa expresa participación de valor comercial por origen en el escenario, no capacidad física expuesta. La evolución se muestra en dos bandas alineadas con escalas independientes, y los planes en un diagrama de trade-off entre servicio y costo. Los escenarios y planes actualizan de forma interactiva el mapa y ambas gráficas. Los nodos de empresa son hipotéticos.

## Archivos

- `index.html`, `styles.css`, `app.js`: interfaz con D3.js v7.9.0 vendorizado localmente.
- `data.json`: snapshot y metadatos de comercio.
- `world.geojson`: geometría Natural Earth low-resolution usada para la visualización.
- `simulation.py`, `main.py`: motor y API local FastAPI.
- `build_preview.py`: genera el HTML independiente `prototipo_local.html`.

No se despliega ni se conecta a sistemas de empresa. No requiere Atlas ni `.env`.
