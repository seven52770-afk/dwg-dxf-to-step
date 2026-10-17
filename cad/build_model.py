from pathlib import Path
import json
from cadgen import build123d as bd
from cadgen import step, stl

@step(out="model.step")
@stl(out="model.stl", mesh_tolerance=0.0005)
def model():
    config = json.loads(Path(__file__).with_name("parameters.json").read_text(encoding="utf-8"))
    p, kind = config["parameters"], config["type"]
    length, width, height = p["length"], p["width"], p["height"]
    align = (bd.Align.MIN, bd.Align.MIN, bd.Align.MIN)
    body = bd.Box(length, width, height, align=align)
    if kind == "rack":
        for x in range(1, p["cols"] + 1):
            for y in range(1, p["rows"] + 1):
                cutter = bd.Cylinder(p["diameter"] / 2, p["depth"] + 1,
                    align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN))
                body -= cutter.moved(bd.Location((x * length / (p["cols"] + 1), y * width / (p["rows"] + 1), height - p["depth"])))
    elif kind == "cap":
        t = p["wall"]
        body -= bd.Box(length - 2*t, width - 2*t, height - t + 1, align=align).moved(bd.Location((t, t, t)))
    elif kind == "bracket":
        t = p["wall"]
        body -= bd.Box(length - t + 1, width + 2, height - t + 1, align=align).moved(bd.Location((t, -1, t)))
    else:
        raise ValueError("Unsupported template")
    body.label = kind
    return body

if __name__ == "__main__":
    model()
