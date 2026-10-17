from pathlib import Path
import json
from cadgen import build123d as bd, step, stl

@step(out='model.step')
@stl(out='model.stl',mesh_tolerance=0.0005)
def model():
    p=json.loads(Path(__file__).with_name('parameters.json').read_text(encoding='utf-8'))['parameters']
    def wire(points): return bd.Wire.make_polygon([(x,y,0) for x,y in points[:-1]],close=True)
    face=bd.Face(wire(p['outer']),[wire(r) for r in p['holes']])
    return bd.extrude(face,amount=p['height'],dir=(0,0,1))

if __name__=='__main__': model()
