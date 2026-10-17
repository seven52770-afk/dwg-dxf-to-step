from pathlib import Path
import json
from cadgen import build123d as b, step, stl
from solid_tools import thread_tools

@step(out='model.step')
@stl(out='model.stl',mesh_tolerance=0.0005)
def model():
    root=Path(__file__).parent
    plan=json.loads((root/'parameters.json').read_text(encoding='utf-8'))['parameters']
    body=None; log=[]
    for op in plan['operations']:
        axis=op.get('axis','z'); direction=op.get('direction',{'x':(1,0,0),'y':(0,1,0),'z':(0,0,1)}[axis])
        if op['kind'] in ('fillet','chamfer'):
            before=body.volume; edges=[]
            for point in op['edgeMidpoints']:
                candidates=[e for e in body.edges() if (e.center()-b.Vector(*point)).length<.02]
                if len(candidates)!=1:raise ValueError('Finishing edge missing or ambiguous; no nearest-edge guessing')
                if candidates[0] in edges:raise ValueError('Duplicate finishing edge')
                edges.append(candidates[0])
            body=b.fillet(edges,op['radius']) if op['kind']=='fillet' else b.chamfer(edges,op['radius'])
            if not body.is_valid or abs(body.volume-before)<1e-6:raise ValueError('Finishing feature invalid or unchanged')
            log.append({'kind':op['kind'],'action':'cut','volume_before':before,'volume_after':body.volume})
            continue
        if op['kind']=='thread_hole':
            before=body.volume
            frame=b.Plane(origin=tuple(op['origin']),z_dir=tuple(direction))
            for tool in thread_tools(op['radius'],op['pitch'],op['depth']):body-=tool.moved(frame.location)
            if before-body.volume<1e-6:raise ValueError('Thread hole did not cut material')
            log.append({'kind':op['kind'],'action':'cut','volume_before':before,'volume_after':body.volume})
            continue
        if op['kind']=='box':
            solid=b.Box(*op['size'],align=(b.Align.MIN,)*3)
        elif op['kind']=='cylinder':
            plane=b.Plane(origin=(0,0,0),z_dir=tuple(direction))
            face=b.Face(b.Wire.make_circle(op['radius'],plane=plane))
            solid=b.extrude(face,amount=op['depth'],dir=direction)
        else:
            def point(p):
                x,y=p
                return {'x':(0,x,y),'y':(x,0,y),'z':(x,y,0)}[axis]
            def wire(r):return b.Wire.make_polygon([point(p) for p in r[:-1]],close=True)
            solid=b.extrude(b.Face(wire(op['outer']),[wire(r) for r in op['holes']]),amount=op['depth'],dir=direction)
        solid=solid.moved(b.Location(tuple(op['origin'])))
        before=body.volume if body is not None else 0
        if body is None:body=solid
        elif op['action']=='add':body=body+solid
        else:body=body-solid
        after=body.volume
        if abs(after-before)<1e-6:raise ValueError('Operation did not change solid volume')
        log.append({'kind':op['kind'],'action':op['action'],'volume_before':before,'volume_after':after})
    (root/'build_log.json').write_text(json.dumps(log),encoding='utf-8')
    return body

if __name__=='__main__':model()

