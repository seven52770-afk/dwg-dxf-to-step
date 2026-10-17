const finite=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
function vector(v,min,max){if(!Array.isArray(v)||v.length!==3||!v.every(n=>finite(n,min,max)))throw Error('尺寸或座標格式不正確，請重新說明。');return [...v];}
export function normalizePlan(p,drawing){
 if(!p||!Array.isArray(p.operations)||p.operations.length<1||p.operations.length>16)throw Error('方案須包含 1～16 個建模步驟。');
 const expectedBounds=vector(p.expectedBounds,.01,1000);
 const operations=p.operations.map((o,i)=>{
  if(!['box','cylinder','thread_hole','fillet','chamfer','profile'].includes(o.kind)||!['add','cut'].includes(o.action)||(i===0&&o.action!=='add'))throw Error('建模步驟不支援，第一步必須建立實體。');
  const r={kind:o.kind,action:o.action,origin:vector(o.origin,-1000,1000)};
  if(['fillet','chamfer'].includes(o.kind)){
   if(o.action!=='cut'||!finite(o.radius,.01,100)||!Array.isArray(o.edgeMidpoints)||!o.edgeMidpoints.length||o.edgeMidpoints.length>32)throw Error('圓角／倒角需要半徑及明確邊線中點。');
   r.radius=o.radius;r.edgeMidpoints=o.edgeMidpoints.map(v=>vector(v,-1000,1000));
  }
  else if(o.kind==='box')r.size=vector(o.size,.01,1000);
  else{
   if(!['x','y','z'].includes(o.axis)||!finite(o.depth,.01,1000))throw Error('拉伸方向或深度無效。');r.axis=o.axis;r.depth=o.depth;
   if(['cylinder','thread_hole'].includes(o.kind)){
    if(!finite(o.radius,.01,500))throw Error('圓孔半徑無效。');r.radius=o.radius;
    if(o.direction!==undefined){const d=vector(o.direction,-1,1),length=Math.hypot(...d);if(Math.abs(length-1)>.001)throw Error('孔方向必須是單位向量，不能猜測角度。');r.direction=d.map(v=>v/length);}
    if(o.kind==='thread_hole'){if(!r.direction)throw Error('螺紋孔缺少明確方向，不能預設正向。');if(o.action!=='cut'||!finite(o.pitch,.1,5)||o.pitch>=o.radius||o.depth/o.pitch>100)throw Error('螺紋孔需切除、有效螺距且最多100圈。');r.pitch=o.pitch;}
   }
   else{const profile=drawing.profiles.find(v=>v.id===o.profileId);if(!profile||!finite(o.scale,.0001,1000))throw Error('找不到選取面域或單位無效。');
    const convert=ring=>ring.map(([x,y])=>[(x-profile.bounds[0])*o.scale,(y-profile.bounds[1])*o.scale]);
    r.profileId=o.profileId;r.scale=o.scale;r.outer=convert(profile.outer);r.holes=profile.holes.map(convert);
    if(r.outer.some(p=>p.some(v=>!finite(v,-1000,1000))))throw Error('輪廓超過建模範圍，請確認單位。');
   }
  }return r;
 });return {operations,expectedBounds};
}
export function describePlan(p){
 const n=v=>Number(v.toFixed(3));
 const lines=p.operations.map((o,i)=>`${i+1}. ${o.action==='cut'?'切除':'建立／合併'}${['fillet','chamfer'].includes(o.kind)?`${o.kind==='fillet'?'圓角R':'等距倒角C'}${n(o.radius)}，${o.edgeMidpoints.length}條邊`:o.kind==='box'?`長方體 ${o.size.map(n).join(' × ')} mm`:['cylinder','thread_hole'].includes(o.kind)?`${o.kind==='thread_hole'?'標稱螺紋孔（螺距'+n(o.pitch)+' mm，未含配合公差）':'圓柱／孔'}：直徑 ${n(o.radius*2)} mm，深度 ${n(o.depth)} mm，${o.direction?'方向向量 ('+o.direction.map(n).join(', ')+')':o.axis.toUpperCase()+' 方向'}`:`圖面面域 ${o.profileId+1}，比例 ${o.scale}，${o.axis.toUpperCase()} 方向拉伸 ${o.depth} mm`}；起點 (${o.origin.map(n).join(', ')})。`);
 return `預期外形：${p.expectedBounds.map(n).join(' × ')} mm\n`+lines.join('\n');
}
export const plannerSchema={type:'object',properties:{decision:{type:'string',enum:['question','plan']},message:{type:'string'},assumptions:{type:'array',items:{type:'string'}},expectedBounds:{type:'array',items:{type:'number'}},operations:{type:'array',items:{type:'object',properties:{kind:{type:'string',enum:['box','cylinder','thread_hole','fillet','chamfer','profile']},action:{type:'string',enum:['add','cut']},origin:{type:'array',items:{type:'number'}},size:{type:'array',items:{type:'number'}},axis:{type:'string',enum:['x','y','z']},depth:{type:'number'},radius:{type:'number'},edgeMidpoints:{type:'array',items:{type:'array',items:{type:'number'},minItems:3,maxItems:3}},pitch:{type:'number'},direction:{type:'array',items:{type:'number'},minItems:3,maxItems:3},profileId:{type:'integer'},scale:{type:'number'}},required:['kind','action','origin','size','axis','depth','radius','profileId','scale','direction','pitch','edgeMidpoints']}}},required:['decision','message','assumptions','expectedBounds','operations']};
