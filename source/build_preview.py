from pathlib import Path
import json
ROOT=Path(__file__).parent
html=(ROOT/'index.html').read_text(encoding='utf-8')
css=(ROOT/'styles.css').read_text(encoding='utf-8')
js=(ROOT/'app.js').read_text(encoding='utf-8')
d3=(ROOT/'vendor/d3.min.js').read_text(encoding='utf-8')
data=json.loads((ROOT/'data.json').read_text(encoding='utf-8'))
world=json.loads((ROOT/'world.geojson').read_text(encoding='utf-8'))
html=html.replace('<link rel="stylesheet" href="styles.css">',f'<style>\n{css}\n</style>')
needle='<script src="vendor/d3.min.js"></script><script src="app.js"></script>'
bundle={'data':data,'world':world}
replacement='<script>window.RIPPLE_BUNDLE='+json.dumps(bundle,separators=(',',':'),ensure_ascii=False).replace('</script>','<\\/script>')+';</script>'
replacement+='<script>'+d3+'</script><script>'+js+'</script>'
if needle not in html: raise RuntimeError('No se encontró el punto de montaje de scripts')
html=html.replace(needle,replacement)
out=ROOT/'prototipo_local.html'
out.write_text(html,encoding='utf-8')
print(f'{out} · {out.stat().st_size:,} bytes · offline self-contained')
