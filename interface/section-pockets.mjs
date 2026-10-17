import {mappedCoordinate} from './dimension-coordinates.mjs';
function inside(point,ring){
 let hit=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [x,y]=ring[i],[u,v]=ring[j];
  if((y>point[1])!==(v>point[1])&&point[0]<(u-x)*(point[1]-y)/(v-y)+x)hit=!hit;
 }
 return hit;
}
// A reviewed front/back contour is linked to an actual hatched section and a
// depth DIMENSION. No inferred default depth, nearest-label match, or through cut.
export function sectionPockets(input,drawing,views,scale,bounds){
 if(input===undefined)return [];
 if(!Array.isArray(input)||input.length>24)throw Error('剖面凹槽最多24處。');
 const seen=new Set();
 return input.map(s=>{
  const view=views.find(v=>v.role===s.role),profile=drawing.profiles.find(p=>p.id===s.profileId);
  const section=drawing.profiles.find(p=>p.id===s.sectionProfileId);
  const hatch=drawing.sectionHatches?.find(h=>h.handle===s.hatchHandle);
  const d=drawing.dimensions.find(d=>d.handle===s.depthDimensionHandle);
  if(!view||!['front','back'].includes(s.role)||!profile||!section||!hatch||!['min','max'].includes(s.side)||
     !d||d.axis!=='X'||!['linear','aligned'].includes(d.kind)||!d.defpoint2||!d.defpoint3)throw Error('凹槽缺少可核對的視圖、剖面填充或深度標註。');
  if(seen.has(s.profileId))throw Error('剖面凹槽重複。');seen.add(s.profileId);
  const label=d.display_text||d.text||'',match=label.match(/^\s*(\d+(?:\.\d+)?)/);
  if(!match)throw Error('凹槽深度標註無法讀取。');
  const depth=Number(match[1])*(drawing.labelUnitScale||1);
  const lo=Math.min(d.defpoint2[0],d.defpoint3[0]),hi=Math.max(d.defpoint2[0],d.defpoint3[0]);
  if(depth<=0||depth>=bounds[1]||Math.abs((hi-lo)*scale-depth)>.02)throw Error('剖面凹槽深度與標註端點不一致。');
  const start=s.side==='max'?hi:lo,floor=s.side==='max'?lo:hi,sign=s.side==='max'?-1:1;
  if(Math.abs((section.bounds[2]-section.bounds[0])*scale-bounds[1])>.02||
     Math.abs(start-section.bounds[s.side==='max'?2:0])*scale>.02)throw Error('剖面凹槽入口與實體表面不一致。');
  const sourceView=drawing.profiles.find(p=>p.id===view.profileId);
  const reference=views.find(v=>v.role===s.sectionViewRole);
  const referenceProfile=reference&&drawing.profiles.find(p=>p.id===reference.profileId);
  const lines=s.cutLineHandles?.map(h=>drawing.sectionLines?.find(l=>l.handle===h));
  if(!referenceProfile||!['front','back'].includes(reference.role)||!lines||lines.length!==2||lines.some(l=>!l)||
     lines.some(l=>Math.abs(l.start[0]-l.end[0])>.001)||Math.abs(lines[0].start[0]-lines[1].start[0])>.001||
     !lines.some(l=>Math.max(l.start[1],l.end[1])>referenceProfile.bounds[3])||
     !lines.some(l=>Math.min(l.start[1],l.end[1])<referenceProfile.bounds[1]))throw Error('凹槽缺少對應視圖上下端的剖切線證據。');
  let cutX=mappedCoordinate((lines[0].start[0]-referenceProfile.bounds[0])*scale,reference.coordinates.x);
  if(reference.flip)cutX=reference.width-cutX;
  const sourceCutX=sourceView.bounds[0]+(view.flip?view.width-cutX:cutX)/scale;
  if(profile.bounds[0]<sourceView.bounds[0]-.001||profile.bounds[2]>sourceView.bounds[2]+.001||
     profile.bounds[1]<sourceView.bounds[1]-.001||profile.bounds[3]>sourceView.bounds[3]+.001||profile.holes.length)throw Error('凹槽輪廓超出所選視圖，或含未核對島形。');
  const material=point=>hatch.regions.some(r=>inside(point,r.outer)&&!r.holes.some(h=>inside(point,h)));
  const zs=[.15,.5,.85].map(t=>section.bounds[1]+profile.bounds[1]-sourceView.bounds[1]+t*(profile.bounds[3]-profile.bounds[1]));
  for(const z of zs){
   if(!inside([sourceCutX,z-section.bounds[1]+sourceView.bounds[1]],profile.outer))throw Error('剖切線未穿過所選凹槽，不能借用其他位置的深度。');
   if(!material([floor+sign*.02/scale,z])||material([floor-sign*.02/scale,z])||material([(start+floor)/2,z]))throw Error('凹槽高度範圍與剖面材料／空腔不一致，不能套用單一深度。');
  }
  const outer=profile.outer.map(([x,y])=>{
   const u=mappedCoordinate((x-sourceView.bounds[0])*scale,view.coordinates.x);
   return [view.flip?view.width-u:u,mappedCoordinate((y-sourceView.bounds[1])*scale,view.coordinates.y)];
  });
  const center=[(Math.min(...outer.map(p=>p[0]))+Math.max(...outer.map(p=>p[0])))/2,
                (Math.min(...outer.map(p=>p[1]))+Math.max(...outer.map(p=>p[1])))/2];
  if(!inside(center,outer))throw Error('凹槽中心在輪廓外，需要另行指定檢查點。');
  return {id:'section:'+s.profileId,kind:'profile_pocket',role:s.role,side:s.side,center,outer,depth,through:false,
   evidence:{depthDimensionHandle:d.handle,label,hatchHandle:hatch.handle,sectionProfileId:section.id,profileId:profile.id,
    cutLineHandles:s.cutLineHandles,sectionViewRole:s.sectionViewRole,cutX,sectionSamples:zs,source:'剖切線、尺寸端點與剖面填充內外比對'},
   warning:'凹槽深度依剖面尺寸；平面輪廓取原圖向量，未標註輪廓尺寸與公差尚未逐項核對。'};
 });
}
