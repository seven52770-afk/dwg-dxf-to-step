"""Build reviewed orthographic contours and features in installed FreeCAD."""
from pathlib import Path
import json, math
import FreeCAD as App
import Part, MeshPart
root=Path(__file__).resolve().parent
p=json.loads((root/'parameters.json').read_text(encoding='utf8'))['parameters']
doc=App.newDocument('DrawingModel');V=App.Vector
def feature(name,shape):
    o=doc.addObject('PartDesign::Feature',name);o.Shape=shape;return o
def polygon(points):return Part.Face(Part.makePolygon([V(*q) for q in points]))
def extrusion(name,face,direction,depth):
    source=feature(name+'Contour',face)
    o=doc.addObject('Part::Extrusion',name);o.Base=source;o.DirMode='Custom';o.Dir=V(*direction);o.LengthFwd=depth;o.Solid=True
    doc.recompute();return o
def boolean(kind,a,b,name):
    o=doc.addObject(kind,name);o.Base=a;o.Tool=b;doc.recompute()
    if o.Shape.isNull() or not o.Shape.isValid() or not o.Shape.Solids:raise ValueError('FreeCAD Boolean produced no valid solid')
    return o
def cylinder(name,point,axis,sign,radius,depth):
    d=[0,0,0];d[axis]=sign;q=list(point);q[axis]-=sign*.01
    o=doc.addObject('Part::Cylinder',name);o.Radius=radius;o.Height=depth+.01;o.Placement=App.Placement(V(*q),App.Rotation(V(0,0,1),V(*d)));doc.recompute();return o
def entry(shape,f):
    u,v=f['center'];role=f['role'];axis={'front':1,'back':1,'top':2,'right':0,'left':0}[role]
    a=list({'front':(u,-1,v),'back':(u,-1,v),'top':(u,v,-1),'right':(-1,u,v),'left':(-1,u,v)}[role]);z=list(a);z[axis]=p['expectedBounds'][axis]+1
    hits=shape.section(Part.makeLine(V(*a),V(*z))).Vertexes
    if not hits:raise ValueError('Hole center does not intersect base')
    a[axis]=(min if f['side']=='min' else max)(list(h.Point)[axis] for h in hits)
    return a,axis,1 if f['side']=='min' else -1
def inside(shape,point):return shape.isInside(V(*point),1e-7,False)
from freecad_threads import thread
body=None;faces={}
for i,view in enumerate(p['views']):
    role=view['role'];flat=polygon([(u,v,0) for u,v in view['outer']])
    opposite=faces.get({'back':'front','left':'right'}.get(role));faces[role]=flat
    if opposite is not None and flat.cut(opposite).Area+opposite.cut(flat).Area<.05:continue
    def point(q):
        u,v=q;return {'front':(u,0,v),'back':(u,0,v),'top':(u,v,0),'right':(0,u,v),'left':(0,u,v)}[role]
    axis={'front':1,'back':1,'top':2,'right':0,'left':0}[role];direction=[0,0,0];direction[axis]=1
    tool=extrusion('View'+str(i),polygon([point(q) for q in view['outer']]),direction,p['expectedBounds'][axis]);tool.Label={'front':'正視輪廓','back':'背視輪廓','top':'俯視輪廓','right':'右視輪廓','left':'左視輪廓'}[role]
    body=tool if body is None else boolean('Part::Common',body,tool,'Views'+str(i))
base=body.Shape.copy();Part.export([body],str(root/'base.step'));records=[]
for i,f in enumerate(p.get('features',[])):
    point,axis,sign=entry(base,f);depth=f['depth'];radius=f.get('diameter',0)/2
    def at(distance,offset=0):
        q=list(point);q[axis]+=sign*distance;q[(axis+1)%3]+=offset;return q
    floor=at(depth+.02);remaining=inside(base,floor)
    if not f['through'] and not remaining and not f.get('allowBreakthrough'):raise ValueError('Blind hole has no remaining floor; confirm breakthrough')
    before=body.Shape.Volume;kind=f['kind'];direction=[0,0,0];direction[axis]=sign
    if kind=='thread_hole':
        shape=thread(radius,f['pitch'],depth);shape.Placement=App.Placement(V(*point),App.Rotation(V(0,0,1),V(*direction)))
        tool=feature('Thread'+str(i),shape)
    elif kind=='profile_pocket':
        face=polygon([(u,point[1]-sign*.01,v) for u,v in f['outer']]);tool=extrusion('Pocket'+str(i),face,direction,depth+.01)
    elif kind=='slot':
        half=(f['length']-f['diameter'])/2;du,dv=f['direction']
        def q(u,v):
            x,y=u*du-v*dv,u*dv+v*du
            return V(*{0:(0,x,y),1:(x,0,y),2:(x,y,0)}[axis])
        edges=[Part.makeLine(q(-half,-radius),q(half,-radius)),Part.Arc(q(half,-radius),q(half+radius,0),q(half,radius)).toShape(),Part.makeLine(q(half,radius),q(-half,radius)),Part.Arc(q(-half,radius),q(-half-radius,0),q(-half,-radius)).toShape()]
        face=Part.Face(Part.Wire(edges));face.translate(V(*at(-.01)));tool=extrusion('Slot'+str(i),face,direction,depth+.01)
    else:tool=cylinder('Hole'+str(i),point,axis,sign,radius,depth)
    tool.Label=f'{i+1} '+{'thread_hole':'標稱螺紋孔','profile_pocket':'剖面凹槽','slot':'長槽','counterbore':'沉孔','hole':'圓孔'}.get(kind,kind)
    body=boolean('Part::Cut',body,tool,'Cut'+str(i))
    probes=[{'point':at(min(depth/2,.1)),'solid':False,'label':'孔口內部'}]
    if not f['through']:probes.extend([{'point':at(depth-.02),'solid':False,'label':'圖註深度'},{'point':floor,'solid':remaining,'label':'孔底或已確認穿出'}])
    if kind=='counterbore':
        cd,cr=f['counterDepth'],f['counterDiameter']/2
        body=boolean('Part::Cut',body,cylinder('Counter'+str(i),point,axis,sign,cr,cd),'CounterCut'+str(i))
        offset=(radius+cr)/2
        if not inside(base,at(cd/2,offset)) or not inside(base,at(cd+.02,offset)):raise ValueError('Counterbore floor outside base')
        probes.extend([{'point':at(cd/2,offset),'solid':False,'label':'沉孔孔徑'},{'point':at(cd+.02,offset),'solid':True,'label':'沉孔階底'}])
    record={**{k:f.get(k) for k in ('id','kind','diameter','length','depth','through','counterDiameter','counterDepth','evidence','warning')},'entry':point,'axis':axis,'sign':sign,'removed_mm3':before-body.Shape.Volume,'probes':probes,'confirmedBreakthrough':bool(not f['through'] and not remaining and f.get('allowBreakthrough'))}
    if kind=='thread_hole':record['pitch']=f['pitch']
    if kind=='profile_pocket':
        record['expectedRemoved_mm3']=face.Area*depth
        box=face.BoundBox
        for tx in (.2,.5,.8):
            for tz in (.2,.5,.8):
                x,z=box.XMin+tx*box.XLength,box.ZMin+tz*box.ZLength
                if face.distToShape(Part.Vertex(V(x,point[1]-sign*.01,z)))[0]>1e-7:continue
                probes.extend([{'point':[x,point[1]+sign*(depth-.02),z],'solid':False,'label':'槽深網格'},{'point':[x,point[1]+sign*(depth+.02),z],'solid':True,'label':'槽底網格'}])
    if record['removed_mm3']<1e-6:raise ValueError('Feature did not remove material')
    records.append(record)
if len(body.Shape.Solids)!=1:raise ValueError('Expected one solid')
for o in doc.Objects:
    if 'Visibility' in o.PropertiesList:o.Visibility=o==body
body.Label='工程圖核對版－詳見缺漏說明'
body.addProperty('App::PropertyString','DrawingScope');body.DrawingScope=p['scope']
doc.recompute();doc.saveAs(str(root/'model.FCStd'));Part.export([body],str(root/'model.step'))
MeshPart.meshFromShape(Shape=body.Shape,LinearDeflection=.02,AngularDeflection=.1,Relative=False).write(str(root/'model.stl'))
(root/'feature-build.json').write_text(json.dumps(records,ensure_ascii=False),encoding='utf8')
App.closeDocument(doc.Name)
