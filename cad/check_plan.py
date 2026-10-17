from pathlib import Path
import json
from cadgen import read_step
root=Path(__file__).parent
p=json.loads((root/'parameters.json').read_text(encoding='utf-8'))['parameters']
s=read_step(str(root/'model.step'));z=s.bounding_box().size;actual=[z.X,z.Y,z.Z]
checks={'valid':bool(s.is_valid if isinstance(s.is_valid,bool) else s.is_valid()),'singleSolid':len(s.solids())==1,
        'dimensionsMatch':all(abs(a-b)<0.02 for a,b in zip(actual,p['expectedBounds'])), 'positiveVolume':s.volume>0}
# Re-read the exported solid: a valid shell can still contain an uncut hole core.
axis_checks=[]
for op in p['operations']:
    if op['kind'] not in ('cylinder','thread_hole') or op['action']!='cut':continue
    d=op.get('direction',{'x':(1,0,0),'y':(0,1,0),'z':(0,0,1)}[op['axis']])
    for fraction in (.25,.5,.75):
        point=tuple(a+v*op['depth']*fraction for a,v in zip(op['origin'],d))
        axis_checks.append(not s.is_inside(point))
checks['cutAxesClear']=all(axis_checks)
log=json.loads((root/'build_log.json').read_text(encoding='utf8'))
checks['allOperationsChangedVolume']=len(log)==len(p['operations']) and all(abs(v['volume_after']-v['volume_before'])>1e-6 for v in log)
result={'passed':all(checks.values()),'checks':checks,'bounds':actual,'units':'mm','volume_mm3':s.volume,
        'limitations':['幾何檢查不代表工程圖所有特徵、公差或加工條件都已核對。']}
(root/'report.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
if not result['passed']:raise ValueError('Geometry or expected dimensions did not match')
