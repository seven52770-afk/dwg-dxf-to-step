"""Execute validated declarative operations using installed FreeCAD, not model code."""
from pathlib import Path
import json
import FreeCAD as App
import Part
import MeshPart
from freecad_threads import thread

root=Path(__file__).resolve().parent
p=json.loads((root/'parameters.json').read_text(encoding='utf-8'))['parameters']
doc=App.newDocument('LocalStudio')
body=None
log=[]
for i,op in enumerate(p['operations']):
    kind=op['kind']
    if kind not in ('box','cylinder','profile','thread_hole','fillet','chamfer'):raise ValueError('Unsupported FreeCAD operation')
    if kind in ('fillet','chamfer'):
        before=body.Shape.Volume;selected=[]
        for point in op['edgeMidpoints']:
            matches=[j+1 for j,e in enumerate(body.Shape.Edges) if (e.CenterOfMass-App.Vector(*point)).Length<.02]
            if len(matches)!=1 or matches[0] in selected:raise ValueError('Finishing edge missing or ambiguous')
            selected.append(matches[0])
        result=doc.addObject('Part::Fillet' if kind=='fillet' else 'Part::Chamfer',f'Finish{i}')
        result.Base=body;result.Edges=[(j,op['radius'],op['radius']) for j in selected];doc.recompute()
        if result.Shape.isNull() or not result.Shape.isValid():raise ValueError('FreeCAD finishing failed')
        body=result;log.append({'kind':kind,'action':'cut','volume_before':before,'volume_after':body.Shape.Volume});continue
    origin=App.Vector(*op['origin'])
    axis=op.get('axis','z')
    direction=App.Vector(*op.get('direction',{'x':[1,0,0],'y':[0,1,0],'z':[0,0,1]}[axis]))
    if kind=='box':
        tool=doc.addObject('Part::Box',f'Box{i}')
        tool.Length,tool.Width,tool.Height=op['size']
        tool.Placement.Base=origin
    elif kind=='thread_hole':
        tool=doc.addObject('PartDesign::Feature',f'Thread{i}');tool.Shape=thread(op['radius'],op['pitch'],op['depth'])
        tool.Placement=App.Placement(origin,App.Rotation(App.Vector(0,0,1),direction))
    elif kind=='cylinder':
        tool=doc.addObject('Part::Cylinder',f'Cylinder{i}')
        tool.Radius,tool.Height=op['radius'],op['depth']
        tool.Placement=App.Placement(origin,App.Rotation(App.Vector(0,0,1),direction))
    else:
        def ring(points):
            def point(q):
                u,v=q
                return App.Vector(*{'x':(0,u,v),'y':(u,0,v),'z':(u,v,0)}[axis])
            return Part.makePolygon([point(q) for q in points])
        face=Part.Face(ring(op['outer']))
        for hole in op['holes']:face=face.cut(Part.Face(ring(hole)))
        base=doc.addObject('PartDesign::Feature',f'Contour{i}');base.Label='圖面輪廓';base.Shape=face
        tool=doc.addObject('Part::Extrusion',f'Extrusion{i}')
        tool.Base=base;tool.DirMode='Custom';tool.Dir=direction;tool.LengthFwd=op['depth'];tool.Solid=True
        tool.Placement.Base=origin
    tool.Label=f'{i+1} '+{'box':'方塊','cylinder':'圓柱／孔','profile':'輪廓拉伸','thread_hole':'標稱螺紋孔'}[kind]
    doc.recompute()
    before=body.Shape.Volume if body else 0
    if body is None:body=tool
    else:
        result=doc.addObject('Part::Fuse' if op['action']=='add' else 'Part::Cut',f'Result{i}')
        result.Base=body;result.Tool=tool;result.Label=f'{i+1} '+('合併' if op['action']=='add' else '切除')
        body=result;doc.recompute()
    if body.Shape.isNull() or not body.Shape.isValid():raise ValueError('FreeCAD invalid operation result')
    after=body.Shape.Volume
    if abs(after-before)<1e-6:raise ValueError('FreeCAD operation did not change volume')
    log.append({'kind':kind,'action':op['action'],'volume_before':before,'volume_after':after})
if len(body.Shape.Solids)!=1:raise ValueError('FreeCAD output is not one solid')
for obj in doc.Objects:
    if 'Visibility' in obj.PropertiesList:obj.Visibility=obj==body
doc.recompute()
doc.saveAs(str(root/'model.FCStd'))
Part.export([body],str(root/'model.step'))
MeshPart.meshFromShape(Shape=body.Shape,LinearDeflection=.02,AngularDeflection=.1,Relative=False).write(str(root/'model.stl'))
(root/'build_log.json').write_text(json.dumps(log),encoding='utf-8')
# Reopening the native project verifies its parametric dependency graph persisted.
volume=body.Shape.Volume;name=body.Name
App.closeDocument(doc.Name)
reopened=App.openDocument(str(root/'model.FCStd'));reopened.recompute()
assert abs(reopened.getObject(name).Shape.Volume-volume)<1e-6
App.closeDocument(reopened.Name)
