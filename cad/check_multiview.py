from pathlib import Path
import json
from cadgen import build123d as b, read_step
root=Path(__file__).parent
p=json.loads((root/'parameters.json').read_text(encoding='utf8'))['parameters']
s=read_step(str(root/'model.step'))
size=s.bounding_box().size
actual=[size.X,size.Y,size.Z]
checks={'valid':bool(s.is_valid if isinstance(s.is_valid,bool) else s.is_valid()),'singleSolid':len(s.solids())==1,
        'bounds':all(abs(a-e)<.02 for a,e in zip(actual,p['expectedBounds'])),'positiveVolume':s.volume>0}
# Every source view must still be represented by the resulting solid's shadow.
# Compare the saved solid's projected planar faces (including occluded faces).
from shapely.geometry import Polygon
from shapely.ops import unary_union
errors=[]
base=read_step(str(root/'base.step')) if p.get('features') else s
vertices,triangles=base.tessellate(.005)
for view in p['views']:
    role=view['role']
    axes={'front':(0,2),'back':(0,2),'top':(0,1),'right':(1,2),'left':(1,2)}[role]
    polygons=[]
    for tri in triangles:
        pts=[tuple(vertices[i]) for i in tri]
        poly=Polygon([(q[axes[0]],q[axes[1]]) for q in pts])
        if poly.is_valid and poly.area>1e-10:polygons.append(poly)
    shadow=unary_union(polygons)
    target=Polygon(view['outer'])
    error=shadow.symmetric_difference(target).area
    tolerance=max(.02,target.area*1e-5)
    checks['projection_'+role]=error<=tolerance
    errors.append({'view':role,'difference_mm2':error,'tolerance_mm2':tolerance})
features=json.loads((root/'feature-build.json').read_text(encoding='utf8'))
checks['featureCount']=len(features)==len(p.get('features',[]))
for i,feature in enumerate(features):
    if feature['kind']=='profile_pocket':
        expected=feature['expectedRemoved_mm3']
        checks[f'pocket_{i}_volume']=abs(feature['removed_mm3']-expected)<max(.02,expected*1e-5)
    if feature['kind']=='thread_hole':
        import math
        radius=feature['diameter']/2
        minor=radius-5*math.sqrt(3)*feature['pitch']/16
        axis=feature['axis'];radial=[k for k in range(3) if k!=axis]
        samples=[];contained=[]
        for k in range(8):
            point=list(feature['entry']);point[axis]+=feature['sign']*feature['pitch']*1.5
            for a,value in zip(radial,(math.cos(k*math.pi/4),math.sin(k*math.pi/4))):point[a]+=value*(minor+radius)/2
            contained.append(base.is_inside(tuple(point),1e-7));samples.append(s.is_inside(tuple(point),1e-7))
        checks[f'thread_{i}_flanks']=all(contained) and any(samples) and not all(samples)
    for j,probe in enumerate(feature['probes']):
        checks[f'feature_{i}_{j}']=bool(s.is_inside(tuple(probe['point']),1e-7))==probe['solid']
result={'passed':all(checks.values()),'checks':checks,'bounds':actual,'volume_mm3':s.volume,'units':'mm',
        'projectionChecks':errors,'projectionSource':'切孔前的多視圖外形','features':features,'scope':p['scope'],'limitations':[p['scope'],'使用向量幾何尺寸，未驗證所有標註或公差與線條一致。']}
(root/'report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
if not result['passed']:raise ValueError('Multiview projection or geometry checks failed')
