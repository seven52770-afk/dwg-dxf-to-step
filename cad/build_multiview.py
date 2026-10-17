from pathlib import Path
import json
from cadgen import build123d as b, step, stl

def entry_point(body,feature,bounds):
    from OCP.IntCurvesFace import IntCurvesFace_ShapeIntersector
    from OCP.gp import gp_Lin,gp_Pnt,gp_Dir
    u,v=feature['center'];role=feature['role']
    point=list({'front':(u,-1,v),'back':(u,-1,v),'top':(u,v,-1),'right':(-1,u,v),'left':(-1,u,v)}[role])
    axis={'front':1,'back':1,'top':2,'right':0,'left':0}[role]
    direction=[0,0,0];direction[axis]=1
    ray=IntCurvesFace_ShapeIntersector();ray.Load(body.wrapped,1e-7)
    ray.Perform(gp_Lin(gp_Pnt(*point),gp_Dir(*direction)),0,bounds[axis]+2)
    hits=[ray.WParameter(i) for i in range(1,ray.NbPnt()+1)]
    if not hits:raise ValueError('Hole center does not intersect the base solid')
    point[axis]+=min(hits) if feature['side']=='min' else max(hits)
    return point,axis,1 if feature['side']=='min' else -1

def circular_tool(point,axis,sign,radius,depth):
    plane={0:b.Plane.YZ,1:b.Plane.ZX,2:b.Plane.XY}[axis]
    face=b.Face(b.Wire.make_circle(radius,plane=plane))
    direction=[0,0,0];direction[axis]=sign
    start=list(point);start[axis]-=sign*.01
    return b.extrude(face,amount=depth+.01,dir=tuple(direction)).moved(b.Location(tuple(start)))

def slot_tool(point,axis,sign,feature):
    radius=feature['diameter']/2;half=(feature['length']-feature['diameter'])/2
    du,dv=feature['direction']
    def pt(u,v):
        x=u*du-v*dv;y=u*dv+v*du
        return {0:(0,x,y),1:(x,0,y),2:(x,y,0)}[axis]
    edges=[b.Edge.make_line(pt(-half,-radius),pt(half,-radius)),b.Edge.make_three_point_arc(pt(half,-radius),pt(half+radius,0),pt(half,radius)),b.Edge.make_line(pt(half,radius),pt(-half,radius)),b.Edge.make_three_point_arc(pt(-half,radius),pt(-half-radius,0),pt(-half,-radius))]
    face=b.Face(b.Wire(edges));direction=[0,0,0];direction[axis]=sign
    start=list(point);start[axis]-=sign*.01
    return b.extrude(face,amount=feature['depth']+.01,dir=tuple(direction)).moved(b.Location(tuple(start)))

def apply_features(body,features,bounds):
    base=body;records=[]
    for f in features:
        point,axis,sign=entry_point(base,f,bounds)
        depth=f['depth'];radius=f.get('diameter',0)/2
        def at(distance,offset=0):
            p=list(point);p[axis]+=sign*distance;p[(axis+1)%3]+=offset;return p
        floor=at(depth+.02)
        floor_remaining=base.is_inside(tuple(floor),1e-7)
        if not f['through'] and not floor_remaining and not f.get('allowBreakthrough',False):
            raise ValueError('Blind hole has no remaining floor in base geometry; confirm breakthrough for this feature explicitly')
        before=body.volume
        if f['kind']=='profile_pocket':
            # Source contour uses the shared X/Z coordinates of its selected view.
            y=point[1]-sign*.01
            wire=b.Wire.make_polygon([(u,y,v) for u,v in f['outer'][:-1]],close=True)
            body-=b.extrude(b.Face(wire),amount=depth+.01,dir=(0,sign,0))
        elif f['kind']=='thread_hole':
            from solid_tools import thread_cutter
            direction=[0,0,0];direction[axis]=sign
            frame=b.Plane(origin=tuple(point),z_dir=tuple(direction))
            body-=thread_cutter(radius,f['pitch'],depth).moved(frame.location)
        else:
            body=body-(slot_tool(point,axis,sign,f) if f['kind']=='slot' else circular_tool(point,axis,sign,radius,depth))
        probes=[{'point':at(min(depth/2,.1)),'solid':False,'label':'孔口內部'}]
        if not f['through']:
            probes.extend([{'point':at(depth-.02),'solid':False,'label':'圖註孔深'}, {'point':floor,'solid':bool(floor_remaining),'label':'盲孔底部' if floor_remaining else '已確認孔深超過局部壁厚，穿出內腔'}])
        if f['kind']=='profile_pocket':
            from shapely.geometry import Polygon,Point
            polygon=Polygon(f['outer']);x0,z0,x1,z1=polygon.bounds
            for tx in (.2,.5,.8):
                for tz in (.2,.5,.8):
                    x,z=x0+tx*(x1-x0),z0+tz*(z1-z0)
                    if not polygon.contains(Point(x,z)):continue
                    probes.extend([{'point':[x,point[1]+sign*(depth-.02),z],'solid':False,'label':'凹槽深度網格'},
                                   {'point':[x,point[1]+sign*(depth+.02),z],'solid':True,'label':'凹槽底部網格'}])
        if f['kind']=='counterbore':
            cd=f['counterDepth'];cr=f['counterDiameter']/2
            body=body-circular_tool(point,axis,sign,cr,cd)
            offset=(radius+cr)/2
            inside=at(cd/2,offset);below=at(cd+.02,offset)
            if not base.is_inside(tuple(inside),1e-7) or not base.is_inside(tuple(below),1e-7):raise ValueError('Counterbore step cannot be verified in base geometry')
            probes.extend([{'point':inside,'solid':False,'label':'沉孔孔徑與深度'},{'point':below,'solid':True,'label':'沉孔階底'}])
        if before-body.volume<1e-6:raise ValueError('Hole did not remove material')
        records.append({'id':f['id'],'kind':f['kind'],'entry':point,'axis':axis,'sign':sign,'diameter':f.get('diameter'),'length':f.get('length'),'depth':depth,'through':f['through'],'counterDiameter':f.get('counterDiameter'),'counterDepth':f.get('counterDepth'),'removed_mm3':before-body.volume,'evidence':f.get('evidence'),'warning':f.get('warning'),'probes':probes})
        if f['kind']=='thread_hole':records[-1]['pitch']=f['pitch']
        if f['kind']=='profile_pocket':records[-1]['expectedRemoved_mm3']=polygon.area*depth
        records[-1]['confirmedBreakthrough']=bool(not f['through'] and not floor_remaining and f.get('allowBreakthrough'))
    return body,records

@step(out='model.step')
@stl(out='model.stl',mesh_tolerance=0.0005)
def model():
    root=Path(__file__).parent
    p=json.loads((root/'parameters.json').read_text(encoding='utf8'))['parameters']
    length,width,height=p['expectedBounds']
    body=None
    for v in p['views']:
        role=v['role']
        opposite=next((q for q in p['views'] if q['role']=={'back':'front','left':'right'}.get(role)),None)
        if opposite is not None:
            from shapely.geometry import Polygon
            a,c=Polygon(opposite['outer']),Polygon(v['outer'])
            # Mirrored tessellated arcs can differ within drawing tolerance; a coincident
            # Boolean may erase the solid. The saved STEP still checks both views.
            if a.hausdorff_distance(c)<.02 and a.symmetric_difference(c).area<.05:
                continue
        def point(p):
            u,w=p
            return {'front':(u,0,w),'back':(u,0,w),'top':(u,w,0),'right':(0,u,w),'left':(0,u,w)}[role]
        wire=b.Wire.make_polygon([point(q) for q in v['outer'][:-1]],close=True)
        depth={'front':width,'back':width,'top':height,'right':length,'left':length}[role]
        direction={'front':(0,1,0),'back':(0,1,0),'top':(0,0,1),'right':(1,0,0),'left':(1,0,0)}[role]
        solid=b.extrude(b.Face(wire),amount=depth,dir=direction)
        body=solid if body is None else body & solid
        if not body.solids() or body.volume<=0:raise ValueError('Views have no common solid')
    b.export_step(body,str(root/'base.step'))
    body,records=apply_features(body,p.get('features',[]),p['expectedBounds'])
    (root/'feature-build.json').write_text(json.dumps(records,ensure_ascii=False),encoding='utf8')
    body.label='多視圖核對版－僅含已選圖註特徵'
    return body

if __name__=='__main__':model()
