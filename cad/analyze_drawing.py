import json, sys, math, hashlib, re
from pathlib import Path
import ezdxf
from ezdxf.path import make_path
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union, polygonize

root=Path(sys.argv[1])
recovery_warning=None
try:doc=ezdxf.readfile(root/'source.dxf')
except (ezdxf.DXFStructureError, UnicodeDecodeError):
    from ezdxf import recover
    doc,auditor=recover.readfile(root/'source.dxf')
    recovery_warning='DXF 結構曾異常，已使用復原讀取；請核對圖面完整性。'
    if auditor.has_errors:raise ValueError('DXF recovery left unresolved structural errors')
units=int(doc.header.get('$INSUNITS',0))
scale={1:25.4,4:1,5:10,6:1000}.get(units)
# User must confirm units before building; analysis uses drawing coordinates.
groups={}; ignored={}; total=0
warnings=[recovery_warning] if recovery_warning else []; incomplete_layers=set(); layer_counts={}
# Preserve dimension evidence even when a dense view cannot be polygonized.
# Never present a partial polygonization as a complete set of model profiles.
for entity in doc.modelspace():
    if entity.dxftype() in ('LINE','ARC','CIRCLE','LWPOLYLINE','POLYLINE','ELLIPSE','SPLINE'):
        layer_counts[entity.dxf.layer]=layer_counts.get(entity.dxf.layer,0)+1
for layer,count in layer_counts.items():
    if count>50000:
        incomplete_layers.add(layer)
        warnings.append(f'圖層「{layer}」有 {count} 個幾何物件，已保留尺寸與文字，但未自動形成面域；不能直接當作完整建模輪廓。')
for entity in doc.modelspace():
    kind=entity.dxftype(); layer=entity.dxf.layer
    if kind not in ('LINE','ARC','CIRCLE','LWPOLYLINE','POLYLINE','ELLIPSE','SPLINE'):
        ignored[kind]=ignored.get(kind,0)+1; continue
    if layer in incomplete_layers: continue
    try:
        points=list(make_path(entity).flattening(distance=0.01/(scale or 1)))
        if any(abs(p.z)>1e-6 for p in points): raise ValueError('non planar')
        coords=[(round(p.x,6),round(p.y,6)) for p in points]
        total+=len(coords)
        if total>250000:
            incomplete_layers.add(layer);groups.pop(layer,None)
            warnings.append(f'圖層「{layer}」超過曲線分析額度，已略過面域重建，尺寸分析仍繼續。')
            continue
        if len(coords)>1: groups.setdefault(layer,[]).append(LineString(coords))
    except RuntimeError: raise
    except Exception: ignored[kind]=ignored.get(kind,0)+1
profiles=[]; profile_count=0; view_outlines=[]
for layer, lines in groups.items():
    layer_polygons=list(polygonize(unary_union(lines)))
    if layer_polygons and not re.search(r'圖框|图框|TEXT|BORDER|TITLE|DIM|尺寸',layer,re.I):
        merged=unary_union(layer_polygons)
        pieces=list(merged.geoms) if hasattr(merged,'geoms') else [merged]
        for poly in pieces:
            if poly.geom_type!='Polygon' or poly.area<1:continue
            filled=Polygon(poly.exterior)
            view_outlines.append({'layer':layer,'area':filled.area,'bounds':list(filled.bounds),'outer':list(filled.exterior.coords),'holes':[], 'kind':'merged_view_outline','source':'同圖層相鄰封閉面域合併；非視圖語意辨識'})
    for poly in layer_polygons:
        if not poly.is_valid or poly.area<1e-8: continue
        profile_count+=1
        profiles.append({'id':len(profiles),'layer':layer,'area':poly.area,'bounds':list(poly.bounds),
                         'outer':list(poly.exterior.coords),'holes':[list(r.coords) for r in poly.interiors]})
        if len(profiles)>1000:
            profiles=sorted(profiles,key=lambda p:p['area'],reverse=True)[:500]
if profile_count>500:
    profiles=sorted(profiles,key=lambda p:p['area'],reverse=True)[:500]
    for i,p in enumerate(profiles):p['id']=i
    warnings.append(f'共找到 {profile_count} 個面域，僅保留面積較大的 500 個供檢視；不是完整特徵清單。')
for outline in sorted(view_outlines,key=lambda p:p['area'],reverse=True)[:100]:
    if any(p['layer']==outline['layer'] and abs(p['area']-outline['area'])<1e-7 and max(abs(a-b) for a,b in zip(p['bounds'],outline['bounds']))<1e-6 for p in profiles):continue
    outline['id']=len(profiles);profiles.append(outline)
dimensions=[]
for entity in doc.modelspace().query('DIMENSION'):
    a=entity.dxf.all_existing_dxf_attribs()
    item={k:(list(v) if hasattr(v,'x') else v) for k,v in a.items() if k in ('handle','dimtype','text','actual_measurement','defpoint','defpoint2','defpoint3','defpoint4','defpoint5')}
    try:
        measurement=entity.get_measurement()
        if isinstance(measurement,(int,float)): item['geometric_measurement']=measurement
    except Exception: pass
    item['kind']={0:'linear',1:'aligned',2:'angle',3:'diameter',4:'radius',5:'angle',6:'ordinate'}.get(entity.dimtype,'unknown')
    try:item['linearScale']=float(entity.override().get('dimlfac',1))
    except Exception:item['linearScale']=1
    if entity.dimtype==6:
        item['axis']='X' if entity.dxf.dimtype & 64 else 'Y'
        k=0 if item['axis']=='X' else 1
        if item.get('defpoint') and item.get('defpoint2'):
            item['geometric_measurement']=abs(item['defpoint2'][k]-item['defpoint'][k])
    elif entity.dimtype in (0,1):
        angle=float(entity.dxf.get('angle',0))%180
        item['axis']='X' if abs(angle)<1e-5 else 'Y' if abs(angle-90)<1e-5 else 'aligned'
    try:
        labels=[]
        for part in entity.virtual_entities():
            if part.dxftype() in ('TEXT','MTEXT'):
                labels.append(part.plain_text() if part.dxftype()=='MTEXT' else part.dxf.text)
        item['display_text']=' '.join(labels)
    except Exception: pass
    dimensions.append(item)
annotations=[]
leaders=[]
for entity in doc.modelspace().query('LEADER'):
    annotation=doc.entitydb.get(entity.dxf.get('annotation_handle',''))
    if annotation is None or annotation.dxftype() not in ('TEXT','MTEXT') or not entity.vertices:
        continue
    text=annotation.plain_text() if annotation.dxftype()=='MTEXT' else annotation.dxf.text
    leaders.append({'id':entity.dxf.handle,'annotationHandle':annotation.dxf.handle,
                    'text':text[:1000],'tip':list(entity.vertices[0]),'source':'linked_leader_annotation'})
for entity in doc.modelspace().query('TEXT MTEXT'):
    text=entity.plain_text() if entity.dxftype()=='MTEXT' else entity.dxf.text
    annotations.append({'text':text[:300],'position':list(entity.dxf.insert)})
# Block notes and attributes often carry hole/thread/depth callouts.
def block_notes(entity,depth=0):
    if depth>8:return
    if entity.dxftype()=='INSERT':
        for attr in entity.attribs:
            annotations.append({'text':attr.dxf.text[:1000],'position':list(attr.dxf.insert),'source':'block_attribute'})
        try:
            for child in entity.virtual_entities():block_notes(child,depth+1)
        except Exception:
            warnings.append('部分圖塊文字無法展開；不能視為全部圖註已讀取。')
    elif entity.dxftype() in ('TEXT','MTEXT'):
        text=entity.plain_text() if entity.dxftype()=='MTEXT' else entity.dxf.text
        annotations.append({'text':text[:1000],'position':list(entity.dxf.insert),'source':'block'})
top_annotations=list(annotations)
for entity in doc.modelspace().query('INSERT'):block_notes(entity)
groups={}
for dim in dimensions:
    if dim.get('kind') in ('linear','aligned'):
        group=groups.setdefault(('linear',dim.get('axis')),{'type':'linear','axis':dim.get('axis'),'dimensions':[]})
        group['dimensions'].append({'value':dim.get('geometric_measurement',dim.get('actual_measurement')),'label':dim.get('display_text',''),'from':dim.get('defpoint2'),'to':dim.get('defpoint3'),'handle':dim['handle']})
        continue
    if dim.get('kind')!='ordinate':continue
    origin=dim.get('defpoint',[])
    key=tuple(round(v,4) for v in origin)
    group=groups.setdefault(key,{'datum':origin,'X':[],'Y':[]})
    group[dim['axis']].append({'value':round(dim.get('geometric_measurement',0)*dim.get('linearScale',1),6),'label':dim.get('display_text',''),'handle':dim['handle']})
callouts=[]
for annotation in annotations:
    match=re.search(r'(?:(\d+)\s*[-xX×]\s*)?C\s*(\d+(?:\.\d+)?)',annotation['text'],re.I)
    if match:callouts.append({'kind':'chamfer','count':int(match[1] or 1),'size_mm':float(match[2]),'text':annotation['text'],'position':annotation['position']})
# Geometry + dimension evidence, independent of filename/DWG container metadata.
fingerprint=[]
for entity in doc.modelspace():
    if entity.dxftype()=='LINE':fingerprint.append(['LINE',entity.dxf.layer,*[round(v,6) for v in entity.dxf.start],*[round(v,6) for v in entity.dxf.end]])
    elif entity.dxftype() not in ('DIMENSION','TEXT','MTEXT'):
        attrs={k:str(v) for k,v in entity.dxf.all_existing_dxf_attribs().items() if k not in ('handle','owner')}
        fingerprint.append([entity.dxftype(),json.dumps(attrs,sort_keys=True)])
for dim in dimensions:fingerprint.append(['DIM',dim.get('dimtype'),dim.get('text'),round(dim.get('actual_measurement',0),6),dim.get('display_text','')])
for annotation in top_annotations:fingerprint.append(['TEXT',annotation['text'],*[round(v,6) for v in annotation['position']]])
fingerprint=hashlib.sha256(json.dumps(sorted(fingerprint,key=str),ensure_ascii=False).encode()).hexdigest()
feature_notes=[a for a in annotations if re.search(r'(?:M\s*\d+(?:\.\d+)?\s*[xX×]|THRU|DEEP|DEPTH|深|盲孔|沉孔|[ØΦ∅⌀]|%%c|\\U\+2205|R\s*\d|C\s*\d)',a['text'],re.I)]
declared_mm=any(re.fullmatch(r'\s*(?:mm|毫米|單位\s*[:：]\s*mm|units?\s*[:：]\s*mm)\s*',a['text'],re.I) for a in annotations)
label_unit_scale=1 if declared_mm else scale
if declared_mm and units!=4:warnings.append('圖框明示毫米，與檔頭單位不同；多視圖功能優先帶入圖框毫米並顯示來源，仍需核對。')
factors=sorted(set(round(d.get('linearScale',1),8) for d in dimensions if d['kind']!='angle' and d.get('linearScale',1)>0))
geometry_scale=label_unit_scale*factors[0] if label_unit_scale and len(factors)==1 else None
circles=[]
for e in doc.modelspace().query('CIRCLE'):
    if abs(e.dxf.center.z)>1e-6:continue
    circles.append({'id':e.dxf.handle,'center':list(e.dxf.center)[:2],'radius':e.dxf.radius,'layer':e.dxf.layer,'linetype':e.dxf.get('linetype','BYLAYER')})
arc_groups={}
for e in doc.modelspace().query('ARC'):
    if abs(e.dxf.center.z)>1e-6:continue
    key=(round(e.dxf.center.x,5),round(e.dxf.center.y,5),round(e.dxf.radius,5),e.dxf.layer)
    group=arc_groups.setdefault(key,{'intervals':[],'handles':[],'linetype':e.dxf.get('linetype','BYLAYER')})
    start=float(e.dxf.start_angle)%360;end=float(e.dxf.end_angle)%360
    group['intervals'].extend([(start,end)] if end>start else [(start,360),(0,end)])
    group['handles'].append(e.dxf.handle)
for (x,y,r,layer),group in arc_groups.items():
    merged=[]
    for a,z in sorted(group['intervals']):
        if merged and a<=merged[-1][1]+1e-5:merged[-1][1]=max(z,merged[-1][1])
        else:merged.append([a,z])
    if sum(z-a for a,z in merged)>=359.9999:
        circles.append({'id':'arcs:'+','.join(group['handles']),'center':[x,y],'radius':r,'layer':layer,'linetype':group['linetype'],'source':'full_circle_from_arcs'})
def endpoint_key(p):return (round(p[0],4),round(p[1],4))
line_keys={frozenset((endpoint_key(e.dxf.start),endpoint_key(e.dxf.end))) for e in doc.modelspace().query('LINE')}
semis=[e for e in doc.modelspace().query('ARC') if abs((e.dxf.end_angle-e.dxf.start_angle)%360-180)<1e-5 and abs(e.dxf.center.z)<1e-6]
slots=[]
for i,a in enumerate(semis):
    for z in semis[i+1:]:
        if a.dxf.layer!=z.dxf.layer or abs(a.dxf.radius-z.dxf.radius)>1e-5:continue
        ac=list(a.dxf.center)[:2];zc=list(z.dxf.center)[:2];dx=zc[0]-ac[0];dy=zc[1]-ac[1];distance=math.hypot(dx,dy)
        if distance<1e-5:continue
        amid=math.radians(a.dxf.start_angle+90);zmid=math.radians(z.dxf.start_angle+90)
        if (math.cos(amid)*dx+math.sin(amid)*dy)/distance>-.99999 or (math.cos(zmid)*dx+math.sin(zmid)*dy)/distance<.99999:continue
        ae=[a.start_point,a.end_point];ze=[z.start_point,z.end_point]
        connected=any(all(frozenset((endpoint_key(ae[k]),endpoint_key(ze[order[k]]))) in line_keys for k in (0,1)) for order in ((0,1),(1,0)))
        if connected:slots.append({'id':'slot:'+a.dxf.handle+':'+z.dxf.handle,'centers':[ac,zc],'radius':a.dxf.radius,'layer':a.dxf.layer})
result={'analysisVersion':6,'geometryFingerprint':fingerprint,'dimensionGroups':list(groups.values()),'callouts':callouts,'units':units,'suggestedScale':scale,'profiles':profiles,'ignored':ignored,'dimensions':dimensions,'annotations':annotations,
        'circles':circles,'slots':slots,'dimensionScaleFactors':factors,'labelUnitScale':label_unit_scale,'suggestedGeometryScale':geometry_scale,'scaleEvidence':{'headerUnitCode':units,'drawingSaysMillimeters':declared_mm,'dimensionFactors':factors},
        'featureNotes':feature_notes,'warnings':warnings,'profileAnalysisComplete':not incomplete_layers and profile_count<=500,'profileCount':profile_count,'dimensionCount':len(dimensions),'annotationCount':len(annotations),
        'notice':'只分析模型空間中的平面輪廓；不自動辨識三視圖、尺寸、圖塊或深度。曲線以約 0.01 mm 弦差離散（未指定單位時為 0.01 圖面單位），轉換比例改變後誤差會同比變動。開放線段不形成可選面域。'}
# Section hatching identifies material, unlike the union of all closed lines.
# Preserve its holes; a hatch is evidence only, never automatically a 3D cut.
from ezdxf.path import from_hatch
section_hatches=[]
for entity in doc.modelspace().query('HATCH'):
    try:
        region=Polygon()
        for path in from_hatch(entity):
            points=list(path.flattening(distance=.002/(scale or 1)))
            if any(abs(p.z)>1e-6 for p in points):raise ValueError('non-planar hatch')
            polygon=Polygon([(p.x,p.y) for p in points])
            if not polygon.is_valid:raise ValueError('invalid hatch boundary')
            region=region.symmetric_difference(polygon)
        pieces=list(region.geoms) if hasattr(region,'geoms') else [region]
        section_hatches.append({'handle':entity.dxf.handle,'pattern':entity.dxf.pattern_name,
            'regions':[{'outer':list(p.exterior.coords),'holes':[list(r.coords) for r in p.interiors]}
                       for p in pieces if p.geom_type=='Polygon' and p.area>1e-8]})
    except Exception:
        warnings.append(f'剖面填充 {entity.dxf.handle} 邊界無法可靠解析，未作為建模證據。')
section_lines=[{'handle':e.dxf.handle,'start':list(e.dxf.start)[:2],'end':list(e.dxf.end)[:2]}
               for e in doc.modelspace().query('LINE') if 'PHANTOM' in e.dxf.get('linetype','').upper()]
result.update(analysisVersion=8,leaders=leaders,sectionHatches=section_hatches,sectionLines=section_lines)
(root/'analysis.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
