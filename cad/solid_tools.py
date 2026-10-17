"""Nominal ISO 60 degree internal thread cutting tools. No fit allowance."""
import math
from cadgen import build123d as b

def thread_tools(radius,pitch,depth):
    if not all(math.isfinite(v) and v>0 for v in (radius,pitch,depth)) or pitch>=radius or depth/pitch>100:
        raise ValueError('Invalid thread size or excessive turn count')
    minor=radius-5*math.sqrt(3)*pitch/16
    overlap=min(.03,pitch*.06)
    helix=b.Helix(pitch,depth+2*pitch,minor,center=(0,0,-pitch))
    inner=minor-overlap; half=.375*pitch+overlap/math.sqrt(3)
    profile=b.Face(b.Wire.make_polygon([(inner,0,-pitch-half),(radius,0,-pitch-pitch/16),(radius,0,-pitch+pitch/16),(inner,0,-pitch+half)],close=True))
    groove=b.sweep(profile,path=helix,is_frenet=True)
    core=b.Cylinder(minor,depth,align=(b.Align.CENTER,b.Align.CENTER,b.Align.MIN))
    limit=b.Cylinder(radius+.1,depth,align=(b.Align.CENTER,b.Align.CENTER,b.Align.MIN))
    # Do not directly fuse coincident seams; thread_cutter separates them first.
    return core,groove&limit

def thread_cutter(radius,pitch,depth):
    core,groove=thread_tools(radius,pitch,depth)
    # Separate the cylinder seam from the helical seam before the Boolean.
    cutter=core.fuse(groove.rotate(b.Axis.Z,90),tol=1e-6)
    if not cutter.is_valid or len(cutter.solids())!=1 or cutter.volume<=core.volume+1e-4:
        raise ValueError('Thread cutter lost its helical flank')
    return cutter
