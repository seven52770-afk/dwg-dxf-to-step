import {mappedCoordinate} from './dimension-coordinates.mjs';
const close=(a,b,t=.02)=>Math.abs(a-b)<=t;
const number='([0-9]+(?:\\.[0-9]+)?)';
export function parseHoleCallout(d){
 const raw=d.text||'',label=d.display_text||'';
 const diameters=[...label.matchAll(/[ØΦ∅⌀]\s*([0-9]+(?:\.[0-9]+)?)/gi)].map(m=>Number(m[1]));
 if(!diameters.length||/M\s*\d+(?:\.\d+)?\s*[x×]/i.test(label))return null;
 const through=/THRU|THROUGH|完全貫穿|通孔|貫通/i.test(label+' '+raw);
 // GDT font x is the depth glyph in these DXF dimension strings. Do not
 // treat an arbitrary last number (often a tolerance) as the hole depth.
 const depthMatch=raw.match(new RegExp('\\\\fGDT[^;}]*;x\\}\\s*'+number,'i'))||label.match(new RegExp('(?:DEEP|DEPTH|深(?:度)?|↧)\\s*[:：]?\\s*'+number,'i'));
 const depth=depthMatch?Number(depthMatch[1]):null;
 const countMatch=label.match(/^\s*(\d+)\s*[xX×-]\s*[ØΦ∅⌀]/);
 const count=countMatch?Number(countMatch[1]):1;
 if(diameters.length===2&&through&&depth)return {kind:'counterbore',diameter:diameters[0],counterDiameter:diameters[1],counterDepth:depth,through:true,count,label,handle:d.handle};
 if(diameters.length===1&&(through||depth))return {kind:'hole',diameter:diameters[0],depth,through,count,label,handle:d.handle};
 return null;
}
export function holeCandidates(drawing,views,scale){
 const output=[],seen=new Set(),unit=drawing.labelUnitScale||1;
 for(const v of views){
  const p=drawing.profiles.find(p=>p.id===v.profileId);if(!p)continue;
  for(const leader of drawing.leaders||[]){
   const match=leader.text.match(/^\s*(?:(\d+)\s*[-×x]\s*)?M\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
   if(!match)continue;
   const diameter=Number(match[2])*unit,pitch=Number(match[3])*unit;
   const through=/\bTHRU\b|\bTHROUGH\b|通孔|貫通/i.test(leader.text);
   const depthMatch=leader.text.match(/(?:DEEP|DEPTH|深(?:度)?)\s*[:：]?\s*(\d+(?:\.\d+)?)/i);
   if(!through&&!depthMatch)continue;
   const [x,y]=leader.tip;
   if(x<p.bounds[0]||x>p.bounds[2]||y<p.bounds[1]||y>p.bounds[3])continue;
   const minor=diameter/2-5*Math.sqrt(3)*pitch/16;
   const circles=(drawing.circles||[]).filter(c=>Math.abs(Math.hypot(c.center[0]-x,c.center[1]-y)-c.radius)*scale<.02&&(close(c.radius*scale,minor)||close(c.radius*scale,diameter/2)));
   const centers=new Map(circles.map(c=>[c.center.map(n=>n.toFixed(4)).join(','),c]));
   if(centers.size!==1)continue;
   const c=[...centers.values()][0];let u=mappedCoordinate((c.center[0]-p.bounds[0])*scale,v.coordinates?.x);if(v.flip)u=v.width-u;
   output.push({id:v.role+':leader:'+leader.id,role:v.role,kind:'thread_hole',diameter,pitch,depth:depthMatch?Number(depthMatch[1])*unit:null,through,count:Number(match[1]||1),label:leader.text,center:[u,mappedCoordinate((c.center[1]-p.bounds[1])*scale,v.coordinates?.y)],source:'linked_leader_and_matching_thread_circle',evidence:{leader:leader.id,annotation:leader.annotationHandle,circleHandles:circles.map(c=>c.id),label:leader.text},warning:'引線已對應螺紋孔；需核對進刀面。建立標稱牙型，不含配合公差。'});
  }
 }
 for(const v of views){
  const p=drawing.profiles.find(p=>p.id===v.profileId);if(!p)continue;
  for(const d of drawing.dimensions||[]){
   if(d.kind!=='diameter'||!d.defpoint||!d.defpoint4)continue;
   const spec=parseHoleCallout(d);if(!spec)continue;
   const c=[(d.defpoint[0]+d.defpoint4[0])/2,(d.defpoint[1]+d.defpoint4[1])/2];
   if(c[0]<p.bounds[0]||c[0]>p.bounds[2]||c[1]<p.bounds[1]||c[1]>p.bounds[3])continue;
   const matches=(drawing.circles||[]).filter(q=>close(q.center[0],c[0])&&close(q.center[1],c[1]));
   if(!matches.some(q=>close(q.radius*2*scale,spec.diameter*unit)||spec.counterDiameter&&close(q.radius*2*scale,spec.counterDiameter*unit)))continue;
   const id=v.role+':'+d.handle;if(seen.has(id))continue;seen.add(id);
   let u=mappedCoordinate((c[0]-p.bounds[0])*scale,v.coordinates?.x);if(v.flip)u=v.width-u;
   output.push({...spec,id,role:v.role,center:[u,mappedCoordinate((c[1]-p.bounds[1])*scale,v.coordinates?.y)],diameter:spec.diameter*unit,
    depth:spec.depth==null?null:spec.depth*unit,counterDiameter:spec.counterDiameter?spec.counterDiameter*unit:undefined,counterDepth:spec.counterDepth?spec.counterDepth*unit:undefined,
    side:null,source:'diameter_dimension_and_matching_circle',evidence:{dimension:d.handle,circleHandles:matches.map(q=>q.id),label:spec.label},
    warning:spec.count>1?`圖註為 ${spec.count} 處；目前只定位這一處，其餘孔位未自動套用。`:'進刀面須核對；圓孔位置與直徑已對應圖面。'});
  }
 }
 for(const v of views){
  const p=drawing.profiles.find(p=>p.id===v.profileId);if(!p)continue;
  const map=c=>{let x=mappedCoordinate((c[0]-p.bounds[0])*scale,v.coordinates?.x);return [v.flip?v.width-x:x,mappedCoordinate((c[1]-p.bounds[1])*scale,v.coordinates?.y)];};
  for(const slot of drawing.slots||[]){
   if(slot.centers.some(c=>c[0]<p.bounds[0]||c[0]>p.bounds[2]||c[1]<p.bounds[1]||c[1]>p.bounds[3]))continue;
   for(const d of drawing.dimensions||[]){
    if(!['linear','aligned'].includes(d.kind)||!d.defpoint2||!d.defpoint3)continue;
    const a=d.defpoint2,b=d.defpoint3,mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    if(!slot.centers.some(c=>close(c[0],mid[0])&&close(c[1],mid[1]))||!close(Math.hypot(a[0]-b[0],a[1]-b[1]),slot.radius*2))continue;
    const spec=parseHoleCallout({...d,display_text:/[ØΦ∅⌀]/.test(d.display_text||'')?d.display_text:'Ø'+(d.display_text||'')});
    if(!spec||spec.kind!=='hole'||!close(spec.diameter*unit,slot.radius*2*scale))continue;
    const c1=map(slot.centers[0]),c2=map(slot.centers[1]),distance=Math.hypot(c2[0]-c1[0],c2[1]-c1[1]);
    const id=v.role+':'+slot.id+':'+d.handle;if(seen.has(id))continue;seen.add(id);
    output.push({...spec,kind:'slot',id,role:v.role,center:[(c1[0]+c2[0])/2,(c1[1]+c2[1])/2],diameter:spec.diameter*unit,length:distance+spec.diameter*unit,direction:[(c2[0]-c1[0])/distance,(c2[1]-c1[1])/distance],depth:spec.depth==null?null:spec.depth*unit,side:null,source:'semicircles_tangent_lines_and_width_dimension',evidence:{dimension:d.handle,slot:slot.id,label:d.display_text},warning:'長圓槽外形與寬度已對應；槽深／通槽依圖註，進刀面仍須核對。'});
   }
  }
 }
 const expanded=[];
 for(const f of output){
  if(!['hole','thread_hole'].includes(f.kind)||f.count<=1){expanded.push(f);continue;}
  const v=views.find(v=>v.role===f.role),p=drawing.profiles.find(p=>p.id===v.profileId),centers=new Map();
  for(const c of drawing.circles||[]){
   const minor=f.kind==='thread_hole'?f.diameter-5*Math.sqrt(3)*f.pitch/8:f.diameter;
   if(c.center[0]<p.bounds[0]||c.center[0]>p.bounds[2]||c.center[1]<p.bounds[1]||c.center[1]>p.bounds[3]||(!close(c.radius*2*scale,f.diameter)&&!close(c.radius*2*scale,minor)))continue;
   centers.set(c.center.slice(0,2).map(n=>n.toFixed(4)).join(','),c);
  }
  const conflicting=output.some(q=>q!==f&&q.role===f.role&&close(q.diameter,f.diameter)&&(q.depth!==f.depth||q.through!==f.through));
  let pairDimension;
  let partialDimensions=[];
  if(!conflicting&&f.kind==='thread_hole'&&centers.size>=3&&centers.size<f.count){
   const items=[...centers.values()],anchor=items.find(c=>f.evidence.circleHandles.includes(c.id)),edges=[];
   const near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])*scale<.02;
   for(const d of drawing.dimensions||[]){
    if(d.kind!=='linear'||!['X','Y'].includes(d.axis)||!d.defpoint2||!d.defpoint3)continue;
    const a=items.find(c=>near(c.center,d.defpoint2)),b=items.find(c=>near(c.center,d.defpoint3));
    const nominal=Number((d.display_text||'').match(/^\s*(\d+(?:\.\d+)?)/)?.[1])*unit;
    if(a&&b&&a!==b&&Number.isFinite(nominal)&&Math.abs(Math.hypot(a.center[0]-b.center[0],a.center[1]-b.center[1])*scale-nominal)<.02)edges.push({a,b,axis:d.axis,id:d.handle});
   }
   const linked=new Set(anchor?[anchor]:[]);
   for(let n=0;n<items.length;n++)for(const e of edges)if(linked.has(e.a)||linked.has(e.b)){linked.add(e.a);linked.add(e.b);}
   const used=edges.filter(e=>linked.has(e.a)&&linked.has(e.b));
   if(linked.size>=3&&new Set(used.map(e=>e.axis)).size===2){
    const known=[...linked];
    // A fourth rectangle corner is located only when both coordinate datums
    // are connected by explicit center-to-center dimensions.
    const grid=items.filter(c=>known.some(q=>Math.abs(q.center[0]-c.center[0])*scale<.02)&&known.some(q=>Math.abs(q.center[1]-c.center[1])*scale<.02));
    if(grid.length===items.length)partialDimensions=used.map(e=>e.id);
   }
  }
  if(!conflicting&&f.count===2&&centers.size>2){
   const anchor=[...centers.values()].find(c=>f.evidence.circleHandles.includes(c.id)),pairs=[];
   if(anchor)for(const d of drawing.dimensions||[]){
    if(!['linear','aligned'].includes(d.kind)||!d.defpoint2||!d.defpoint3)continue;
    const near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])*scale<.02;
    const other=near(d.defpoint2,anchor.center)?d.defpoint3:near(d.defpoint3,anchor.center)?d.defpoint2:null;
    if(!other)continue;
    const circle=[...centers.values()].find(c=>c!==anchor&&near(c.center,other));
    const nominal=Number((d.display_text||'').match(/^\s*(\d+(?:\.\d+)?)/)?.[1])*unit;
    if(circle&&Number.isFinite(nominal)&&Math.abs(Math.hypot(circle.center[0]-anchor.center[0],circle.center[1]-anchor.center[1])*scale-nominal)<.02)pairs.push({circle,dimension:d.handle});
   }
   if(pairs.length===1){centers.clear();centers.set(anchor.id,anchor);centers.set(pairs[0].circle.id,pairs[0].circle);pairDimension=pairs[0].dimension;}
  }
  if((centers.size!==f.count&&!partialDimensions.length)||conflicting){expanded.push({...f,warning:f.warning+` 圖註 ${f.count} 處，僅定位此孔，其餘尚未對應。`});continue;}
  let index=0;
  for(const c of centers.values()){
   let u=mappedCoordinate((c.center[0]-p.bounds[0])*scale,v.coordinates?.x);if(v.flip)u=v.width-u;
   expanded.push({...f,id:f.id+':repeat'+index++,center:[u,mappedCoordinate((c.center[1]-p.bounds[1])*scale,v.coordinates?.y)],evidence:{...f.evidence,circleHandles:[c.id],matchedCount:centers.size,pairDimension,partialDimensions,unlocatedCount:f.count-centers.size},warning:(partialDimensions.length?`孔距尺寸已對應 ${centers.size} 處；圖註 ${f.count} 處中仍有 ${f.count-centers.size} 處未定位，未建立。`:pairDimension?'孔距標註的兩端精確對應此組孔。':`同一視圖恰有 ${f.count} 個同徑圓，對應數量圖註。`)+' 進刀面仍需核對。'});
  }
 }
 return expanded;
}
export function normalizeFeatures(input,candidates,bounds){
 if(input==null)return [];
 if(!Array.isArray(input)||input.length>32)throw Error('最多處理 32 個已核對孔槽。');
 const used=new Set();
 return input.map(f=>{
  const source=candidates.find(c=>c.id===f.id);
  if(!source||used.has(f.id))throw Error('孔特徵來源不存在或重複。');used.add(f.id);
  if(!['min','max'].includes(f.side))throw Error('請核對每個孔的進刀面，不能自行猜測前後方向。');
  const axis={front:1,back:1,top:2,right:0,left:0}[source.role];
  const depth=source.through?bounds[axis]+2:source.depth;
  if(!Number.isFinite(depth)||depth<=0||depth>bounds[axis]+2)throw Error('孔深超出零件範圍，請核對圖註。');
  if(source.kind==='thread_hole'&&(!(source.pitch>=.1&&source.pitch<=5)||source.pitch>=source.diameter/2||depth/source.pitch>100))throw Error('螺距或螺紋深度超出可驗證範圍。');
  if(source.kind==='counterbore'&&(!(source.counterDiameter>source.diameter)||source.counterDepth<=0||source.counterDepth>=bounds[axis]))throw Error('沉孔直徑或深度不合理。');
  if(f.allowBreakthrough!==undefined&&typeof f.allowBreakthrough!=='boolean')throw Error('孔底穿出確認格式錯誤。');
  const allowBreakthrough=f.allowBreakthrough===true&&!source.through;
  return {...source,side:f.side,depth,allowBreakthrough,warning:source.warning+(allowBreakthrough?' 使用者確認：依圖註深度切除，若局部壁厚不足，允許穿出內腔；不視為有完整孔底的盲孔。':'')};
 });
}
