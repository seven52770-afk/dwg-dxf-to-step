import math
import FreeCAD as App
import Part
V=App.Vector
def thread(radius,pitch,depth):
    if pitch<=0 or pitch>=radius or depth/pitch>100:raise ValueError('Invalid thread parameters')
    minor=radius-5*math.sqrt(3)*pitch/16;overlap=min(.03,pitch*.06);inner=minor-overlap;half=.375*pitch+overlap/math.sqrt(3)
    path=Part.makeHelix(pitch,depth+2*pitch,minor);path.translate(V(0,0,-pitch))
    wire=Part.makePolygon([V(inner,0,-pitch-half),V(radius,0,-pitch-pitch/16),V(radius,0,-pitch+pitch/16),V(inner,0,-pitch+half),V(inner,0,-pitch-half)])
    groove=Part.Wire(path.Edges).makePipeShell([Part.Wire(wire.Edges)],True,True)
    groove=groove.common(Part.makeCylinder(radius+.1,depth));groove.rotate(V(),V(0,0,1),90)
    core=Part.makeCylinder(minor,depth);cutter=core.fuse(groove,1e-6)
    if not cutter.isValid() or len(cutter.Solids)!=1 or cutter.Volume<=core.Volume+1e-4:raise ValueError('Thread cutter lost flank')
    return cutter
