from pathlib import Path
import json, math
from cadgen import read_step

root = Path(__file__).parent
config = json.loads((root / 'parameters.json').read_text(encoding='utf-8'))
p, kind = config['parameters'], config['type']
shape = read_step(str(root / 'model.step'))
box = shape.bounding_box().size
actual = [box.X, box.Y, box.Z]
expected = [p['length'], p['width'], p['height']]
l, w, h = expected
volume = p['area']*h if kind == 'drawing' else l*w*h
if kind == 'rack': volume -= p['cols']*p['rows']*math.pi*(p['diameter']/2)**2*p['depth']
elif kind == 'cap': volume -= (l-2*p['wall'])*(w-2*p['wall'])*(h-p['wall'])
elif kind == 'bracket': volume = p['wall']*w*l + p['wall']*w*(h-p['wall'])
valid = shape.is_valid if isinstance(shape.is_valid, bool) else shape.is_valid()
checks = {'valid': bool(valid), 'singleSolid': len(shape.solids()) == 1,
          'dimensionsMatch': all(abs(a-b)<0.02 for a,b in zip(actual,expected)),
          'volumeMatch': abs(shape.volume-volume)<max(0.01, volume*1e-6)}
report = {'passed': all(checks.values()), 'checks': checks, 'units': 'mm', 'bounds': actual,
          'volume_mm3': shape.volume, 'expected_volume_mm3': volume,
          'limitations': ['未驗證承載、耐熱、裝配公差與實際列印結果。', '工程圖曲線為離散近似；內圈為貫穿孔，未自動重建其他視圖。' if kind == 'drawing' else '保護蓋以開口朝上建模；支架未包含安裝孔。']}
(root/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
if not report['passed']: raise RuntimeError('Geometry checks failed')
print(json.dumps(report,ensure_ascii=False))
