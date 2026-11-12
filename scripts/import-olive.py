"""Import the author's B-pattern tower CAD, with one reusable module instance.
Usage: python3 scripts/import-olive.py /path/to/concept-archive
Rendering retains the CAD mesh. Optical panels are single inner skins extracted
from the same curved solids, preserving capsule holes and their frosted inlays.
"""
import json, math, hashlib, sys, re
from pathlib import Path
root=Path(__file__).resolve().parent.parent
archive=Path(sys.argv[1]); folder=next(archive.glob('17_*'))
data=json.loads((folder/'Исходники/mesh_preview.json').read_text())
single=data['02_Один_модуль_B_на_подставке']; tower=data['03_Башенка_три_модуля_B_на_подставке']

def pack(name, meshes, filters=None):
    vertices=[]; indices=[]; lookup={}
    for m in meshes:
        for t in m['triangles']:
            if filters and not filters(m,t): continue
            ids=[]
            for i in t:
                p=tuple(round(a*10) for a in m['vertices'][i])
                if p not in lookup:
                    lookup[p]=len(vertices)//3;vertices.extend(p)
                ids.append(lookup[p])
            if len(set(ids))==3:
                a,b,c=[vertices[i*3:i*3+3] for i in ids]
                u=[b[i]-a[i] for i in range(3)];v=[c[i]-a[i] for i in range(3)]
                cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
                if any(cross): indices.extend(ids)
    return {'name':name,'color':meshes[0]['color'],'v':vertices,'t':indices}

def grouped(meshes):
    groups={}
    for m in meshes:
        key=tuple(m['color']);groups.setdefault(key,[]).append(m)
    return [pack('CAD_'+str(i),g) for i,g in enumerate(groups.values())]

# Original placeholder tube is not a real LED. Omit it, and the hidden ballast,
# fasteners and inner cable core. Keep the exact visible casing, slots and cable.
base=[m for m in single[:18] if not any(k in m['name'] for k in ['Internal_ballast','insulated_core','screw','bolt','nut','bottom_service'])]
module=[m for m in single[18:] if 'Central_light_placeholder' not in m['name']]
joint=[m for m in tower if m['name'].startswith('J1_')]
# Store joint at its CAD height 454 mm; the second instance adds 418 mm.
R=90;M=38;c=(R*R-M*M)/(2*(R*math.cos(math.radians(52))-M));rho=c-M

def inner(m,t):
    angle=math.radians(150 if 'Side_A' in m['name'] else 30 if 'Side_B' in m['name'] else 270)
    cx,cy=c*math.cos(angle),c*math.sin(angle)
    return all(abs(math.hypot(m['vertices'][i][0]-cx,m['vertices'][i][1]-cy)-(rho+2.6))<.002 for i in t)

optical=[]
for kind, pred in [('clear',lambda n:'Clear_front_panel' in n),('frost',lambda n:'Frosted_slot' in n),('screen',lambda n:'Reflective_inner_metal' in n)]:
    part=pack(kind,[m for m in module if pred(m['name'])],inner);part['kind']=kind;optical.append(part)
# Opaque end covers preserve ventilation openings; rails and inner frames block.
housing=[m for m in module if any(k in m['name'] for k in ['internal_frame','Corner_rail','vented_cover'])]
part=pack('housing',housing);part['kind']='housing';optical.append(part)
result=[{'label':'Три поворотных блока','meshes':[],'sources':[],
         'moduleMeshes':grouped(module),'baseMeshes':grouped(base),'jointMeshes':grouped(joint),'opticalMeshes':optical}]
content=json.dumps(result,separators=(',',':'),ensure_ascii=False)
name='olive-'+hashlib.sha256(content.encode()).hexdigest()[:12]+'.json'
(root/'data/cad'/name).write_text(content)
# Amend the asset registry rather than regenerating unrelated CAD assets.
p=root/'src/data/cad-assets.js';s=p.read_text()
s=re.sub(r'  olive:\s*\{[^}]*\},?\s*', '', s)
at=s.rfind('};')
s=s[:at]+'  olive: '+json.dumps({'file':name,'archive':folder.name+'/Исходники/mesh_preview.json'},ensure_ascii=False)+',\n'+s[at:];p.write_text(s)
print(name,len(content),'bytes; optical triangles',sum(len(m['t'])//3 for m in optical))
