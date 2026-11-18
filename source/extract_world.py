import json, struct
from pathlib import Path
base=Path('/workspace/scratch/408f71ef1daa/gaza_deps/pyogrio/tests/fixtures/naturalearth_lowres/naturalearth_lowres')
# Read DBF attributes
b=base.with_suffix('.dbf').read_bytes()
num=struct.unpack_from('<I',b,4)[0]; header_len=struct.unpack_from('<H',b,8)[0]; rec_len=struct.unpack_from('<H',b,10)[0]
fields=[]; pos=32
while pos<header_len-1:
    if b[pos]==0x0d: break
    name=b[pos:pos+11].split(b'\0',1)[0].decode('ascii','ignore').strip()
    typ=chr(b[pos+11]); size=b[pos+16]; fields.append((name,typ,size)); pos+=32
records=[]; pos=header_len
for _ in range(num):
    rec=b[pos:pos+rec_len]; pos+=rec_len
    if not rec or rec[0]==0x2a: records.append({}); continue
    off=1; row={}
    for name,typ,size in fields:
        raw=rec[off:off+size]; off+=size
        row[name]=raw.decode('latin1','ignore').strip()
    records.append(row)
# Read polygon SHP records, low-res map source is Natural Earth dataset bundled in local pyogrio test fixtures.
s=base.with_suffix('.shp').read_bytes(); offset=100; shapes=[]
def simplify(points, tol=0.45):
    if len(points)<=5: return points
    # iterative Douglas-Peucker in lon/lat coordinate space
    keep={0,len(points)-1}; stack=[(0,len(points)-1)]
    while stack:
        a,z=stack.pop(); ax,ay=points[a]; zx,zy=points[z]
        dx=zx-ax; dy=zy-ay; denom=dx*dx+dy*dy
        best=tol; idx=None
        for i in range(a+1,z):
            x,y=points[i]
            t=0 if denom==0 else max(0,min(1,((x-ax)*dx+(y-ay)*dy)/denom))
            d=((x-(ax+t*dx))**2+(y-(ay+t*dy))**2)**0.5
            if d>best: best=d; idx=i
        if idx is not None:
            keep.add(idx); stack.extend([(a,idx),(idx,z)])
    out=[points[i] for i in sorted(keep)]
    return out if len(out)>=4 else points[:4]
for ri in range(num):
    recnum, words=struct.unpack_from('>2i',s,offset); offset+=8; size=words*2; body=s[offset:offset+size]; offset+=size
    if len(body)<44: continue
    st=struct.unpack_from('<i',body,0)[0]
    if st not in (5,15,25): continue
    nparts,npts=struct.unpack_from('<2i',body,36)
    parts=list(struct.unpack_from('<'+'i'*nparts,body,44))
    pts=[]; p=44+4*nparts
    for i in range(npts): pts.append(struct.unpack_from('<2d',body,p+16*i))
    parts.append(npts); rings=[]
    for j in range(nparts):
        ring=pts[parts[j]:parts[j+1]]
        if len(ring)<4: continue
        ring=simplify(ring)
        # SHP rings in the bundled low-res fixture can omit the closing point.
        # GeoJSON LinearRings must explicitly repeat their first coordinate.
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        # D3 geoPath follows spherical winding: clockwise exterior rings represent
        # the country interior. Normalize each component accordingly; reversing
        # them makes D3 render the complement of each country.
        if len(ring)>=4:
            signed_area=sum(ring[k][0]*ring[(k+1)%len(ring)][1]-ring[(k+1)%len(ring)][0]*ring[k][1] for k in range(len(ring)))
            if signed_area > 0:
                ring=list(reversed(ring))
            rings.append(ring)
    if not rings: continue
    row=records[ri] if ri<len(records) else {}
    name=row.get('name') or row.get('NAME') or row.get('admin') or row.get('ADMIN') or f'land-{ri}'
    # each ring rendered as a separate polygon; intended as a low-res visual basemap, not analytical boundaries
    shapes.append({'type':'Feature','properties':{'name':name},'geometry':{'type':'MultiPolygon','coordinates':[[[list(p) for p in ring]] for ring in rings]}})
out={'type':'FeatureCollection','features':shapes}
Path('prototipos_ia/the_ripple_room/world.geojson').write_text(json.dumps(out,separators=(',',':')),encoding='utf8')
print('features',len(shapes),'bytes',Path('prototipos_ia/the_ripple_room/world.geojson').stat().st_size,'fields',fields[:8])
