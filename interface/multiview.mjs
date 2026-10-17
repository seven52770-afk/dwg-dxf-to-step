import {holeCandidates,normalizeFeatures} from './hole-features.mjs';
import {coordinateEvidence,mappedCoordinate} from './dimension-coordinates.mjs';
import {sectionPockets} from './section-pockets.mjs';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export function multiviewCandidates(drawing){
 const p=drawing.profiles.filter(p=>p.area>1&&p.outer.length<4000&&!/圖框|图框|TEXT|BORDER|TITLE|DIM|尺寸/i.test(p.layer)),candidates=[];
 for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){
  const a=p[i],b=p[j],aw=a.bounds[2]-a.bounds[0],ah=a.bounds[3]-a.bounds[1],bw=b.bounds[2]-b.bounds[0],bh=b.bounds[3]-b.bounds[1];
  const alignedX=Math.abs(a.bounds[0]-b.bounds[0])<.02&&Math.abs(aw-bw)<.02;
  const alignedY=Math.abs(a.bounds[1]-b.bounds[1])<.02&&Math.abs(ah-bh)<.02;
  const bonus=a.kind==='merged_view_outline'&&b.kind==='merged_view_outline'?1000000:0;
  if(alignedX&&(a.bounds[3]<b.bounds[1]||b.bounds[3]<a.bounds[1])){
   const [lower,upper]=a.bounds[1]<b.bounds[1]?[a,b]:[b,a];
   for(const [front,top]of [[lower,upper],[upper,lower]]){
    const sides=p.filter(v=>v.id!==front.id&&v.id!==top.id&&Math.abs(v.bounds[1]-front.bounds[1])<.02&&Math.abs((v.bounds[3]-v.bounds[1])-(front.bounds[3]-front.bounds[1]))<.02&&Math.abs((v.bounds[2]-v.bounds[0])-(top.bounds[3]-top.bounds[1]))<.02&&(v.bounds[2]<front.bounds[0]||v.bounds[0]>front.bounds[2]));
    const side=sides.sort((a,b)=>b.area-a.area)[0];
    candidates.push({front:front.id,other:top.id,right:side?.id,role:'top',score:bonus+Math.min(a.area,b.area)+(side?10000:0),reason:side?'三個視圖共同軸尺寸對應；需核對方向。':'同長度且水平對齊；需核對主視圖與投影方向。'});
   }
  }
  if(alignedY&&(a.bounds[2]<b.bounds[0]||b.bounds[2]<a.bounds[0])){const [left,right]=a.bounds[0]<b.bounds[0]?[a,b]:[b,a];candidates.push({front:left.id,other:right.id,role:'right',score:bonus+Math.min(a.area,b.area),reason:'同高度且垂直對齊；需核對側視方向。'});}
 }
 return candidates.sort((a,b)=>b.score-a.score).slice(0,20);
}
export function prepareMultiview(input,drawing){
 const scale=Number(input.scale);
 if(!finite(scale)||scale<=0||scale>1000)throw Error('請核對圖面單位。');
 const selections=input.views;
 if(!Array.isArray(selections)||selections.length<2||selections.length>5)throw Error('請選擇主視圖及至少一個俯視圖或側視圖。');
 const roles=new Set(),ids=new Set();
 const views=selections.map(s=>{
  if(!['front','back','top','right','left'].includes(s.role)||roles.has(s.role)||ids.has(s.profileId))throw Error('視圖方向或輪廓重複。');
  roles.add(s.role);ids.add(s.profileId);
  const p=drawing.profiles.find(p=>p.id===s.profileId);
  if(!p)throw Error('所選視圖已不存在，請重新讀圖。');
  const coordinates=coordinateEvidence(drawing,p,scale);
  const width=coordinates.x.at(-1)[1],height=coordinates.y.at(-1)[1];
  if(Math.min(width,height)<.01||Math.max(width,height)>1000)throw Error('視圖尺寸超出 0.01～1000 mm，請核對單位。');
  const outer=p.outer.map(([x,y])=>{const u=mappedCoordinate((x-p.bounds[0])*scale,coordinates.x),v=mappedCoordinate((y-p.bounds[1])*scale,coordinates.y);return [s.flip?width-u:u,v];});
  const evidence=[...coordinates.evidence];
  for(const d of drawing.dimensions||[]){
   if(!['linear','aligned'].includes(d.kind)||!d.defpoint2||!d.defpoint3||!['X','Y'].includes(d.axis))continue;
   const k=d.axis==='X'?0:1,lo=Math.min(d.defpoint2[k],d.defpoint3[k]),hi=Math.max(d.defpoint2[k],d.defpoint3[k]);
   if(Math.abs(lo-p.bounds[k])>.02||Math.abs(hi-p.bounds[k+2])>.02)continue;
   const label=d.display_text||d.text||'',match=label.match(/^\s*([+\-]?\d+(?:\.\d+)?)/);
   const factor=d.linearScale>0?d.linearScale:1;
   if(match&&Math.abs(Number(match[1])-(hi-lo)*factor)*(drawing.labelUnitScale||1)>.02)throw Error(`所選視圖的標註 ${label} 與套用尺寸比例後的長度 ${((hi-lo)*factor).toFixed(3)} 不一致；需按標註重建輪廓，不能直接拉伸線條。`);
   evidence.push({axis:d.axis,label,from:d.defpoint2,to:d.defpoint3});
  }
  return {role:s.role,profileId:p.id,width,height,outer,coordinates,flip:!!s.flip,ignoredInnerLoops:p.holes.length,dimensionEvidence:evidence};
 });
 if(!roles.has('front'))throw Error('需要主視圖，才能建立共同 X／Z 座標。');
 if(!roles.has('top')&&!roles.has('right')&&!roles.has('left'))throw Error('正反面不能提供厚度，仍需俯視或側視圖。');
 const front=views.find(v=>v.role==='front'),top=views.find(v=>v.role==='top'),right=views.find(v=>v.role==='right'),left=views.find(v=>v.role==='left');
 const pairs=[];const back=views.find(v=>v.role==='back');
 if(back)pairs.push(['正反面長度',front.width,back.width],['正反面高度',front.height,back.height]);
 if(top)pairs.push(['主視圖與俯視圖的長度',front.width,top.width]);
 if(left){pairs.push(['主視圖與左視圖的高度',front.height,left.height]);if(top)pairs.push(['俯視圖與左視圖的寬度',top.height,left.width]);if(right)pairs.push(['左右視圖寬度',right.width,left.width]);}
 if(right)pairs.push(['主視圖與右視圖的高度',front.height,right.height]);
 if(top&&right)pairs.push(['俯視圖與右視圖的寬度',top.height,right.width]);
 for(const [label,a,b]of pairs)if(Math.abs(a-b)>.02)throw Error(`${label}不一致（${a.toFixed(3)}／${b.toFixed(3)} mm）；不能把它們硬縮放成同一零件。請核對視圖或比例。`);
 const bounds=[front.width,top?.height??right?.width??left.width,front.height];
 const candidates=holeCandidates(drawing,views,scale),features=[...normalizeFeatures(input.features,candidates,bounds),...sectionPockets(input.sectionPockets,drawing,views,scale,bounds)];
 return {views,expectedBounds:bounds,scale,drawingId:input.drawingId,sourceName:drawing.name,
  features,featureCandidates:candidates,
  scope:`多視圖核對版：外輪廓交集${features.length?`及 ${features.length} 個已選圖註孔槽特徵`:''}。不是唯一三維解；未選孔槽與螺紋、其他內腔、倒角及公差尚未建立。內圈不自動當通孔。${[...new Set(features.map(f=>f.warning).filter(Boolean))].join(" ")}`,
  alignmentChecks:pairs.map(([label,a,b])=>({label,a,b,tolerance:.02})),
  dimensionEvidence:(drawing.dimensions||[]).filter(d=>d.display_text).map(d=>({label:d.display_text,kind:d.kind,from:d.defpoint2,to:d.defpoint3})),
 };
}
