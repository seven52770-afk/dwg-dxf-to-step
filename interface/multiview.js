(()=>{
 const button=document.createElement('button');button.type='button';button.textContent='多視圖外形重建';
 document.querySelector('.chat-attachments').append(button);
 const dialog=document.createElement('dialog');dialog.className='multiview-dialog';
 dialog.innerHTML='<h2>多視圖外形重建</h2><p>選取主視圖，以及俯視圖或側視圖的完整外輪廓。兩個方向的視圖會共同決定長、寬、高，不必再填拉伸厚度。</p><p><strong>此功能建立多視圖核對版。</strong>可加入已對應圖註的通孔、盲孔、沉孔、長圓槽及引線螺紋孔。未對應的內腔、螺紋與倒角仍未完成；圖面內圈不自動當通孔。線條尺寸與標註有差異時，請勿把結果當加工完成品。</p><div class="field-grid"><label>圖面單位<select id="mv-scale"><option value="1">毫米</option><option value="25.4">英吋</option><option value="10">公分</option><option value="1000">公尺</option></select></label><label>目前在圖上選擇<select id="mv-role"><option value="front">主視圖：長／高</option><option value="back">背視圖：長／高</option><option value="top">俯視圖：長／寬</option><option value="right">右視圖：寬／高</option><option value="left">左視圖：寬／高</option></select></label></div><p>點選下方輪廓線指定視圖；也可使用選單。水平反轉用於調整投影方向，請核對左、右特徵。</p><canvas id="mv-canvas" width="900" height="480" class="mesh-canvas" aria-label="多視圖輪廓選擇"></canvas><div id="mv-views" class="field-grid"></div><p id="mv-notes" class="muted"></p><p id="mv-status" role="status"></p><div class="inline"><button type="button" id="mv-check">檢查視圖尺寸</button><button type="button" id="mv-build" class="primary" disabled>建立外形核對版 STEP</button><button type="button" id="mv-close">關閉</button></div>';
 document.body.append(dialog);
 const featuresPanel=document.createElement('div');featuresPanel.id='mv-features';document.getElementById('mv-notes').after(featuresPanel);
 document.getElementById('mv-build').textContent='建立核對版 STEP';
 const el=id=>document.getElementById(id),roles=[['front','主視圖：長／高','#d98531'],['back','背視圖：長／高','#a958aa'],['top','俯視圖：長／寬','#168a68'],['right','右視圖：寬／高','#487de0'],['left','左視圖：寬／高','#a67621']];
 let drawing,chat,checked=false,transform,featureSelection=[];
 const status=t=>el('mv-status').textContent=t;
 function invalidate(){checked=false;featureSelection=[];el('mv-features').replaceChildren();el('mv-build').disabled=true;status('選取至少兩個視圖後，按「檢查視圖尺寸」。');paint();}
 function selection(){return {drawingId:drawing.id,scale:Number(el('mv-scale').value),features:featureSelection.filter(f=>f.enabled).map(({id,side,allowBreakthrough})=>({id,side,allowBreakthrough:!!allowBreakthrough})),views:roles.filter(([r])=>el('mv-'+r).value!=='').map(([r])=>({role:r,profileId:Number(el('mv-'+r).value),flip:el('mv-flip-'+r).checked}))};}
 function showFeatures(candidates){
  const panel=el('mv-features');panel.replaceChildren();const heading=document.createElement('h3');heading.textContent=`已對應圖註的孔／槽：${candidates.length} 處`;panel.append(heading);
  if(!candidates.length){const p=document.createElement('p');p.textContent='尚未找到圓孔與孔深／通孔註記的明確對應，不會猜測。';panel.append(p);return;}
  for(const c of candidates){let choice=featureSelection.find(f=>f.id===c.id);if(!choice){choice={id:c.id,side:'',enabled:false};featureSelection.push(choice);}
   const row=document.createElement('div'),label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=choice.enabled;check.style.width='auto';label.append(check,document.createTextNode(`${c.role==='top'?'俯視圖':c.role==='front'?'主視圖':c.role==='back'?'背視圖':c.role==='left'?'左視圖':'右視圖'}：${c.label}；位置 ${c.center.map(v=>v.toFixed(3)).join(' / ')} mm`));row.append(label);
   const side=document.createElement('select');side.setAttribute('aria-label','此孔進刀面');side.add(new Option('請核對進刀面',''));const axis={front:'Y',back:'Y',top:'Z',right:'X',left:'X'}[c.role];side.add(new Option(`從 ${axis} 最小端面往內`,'min'));side.add(new Option(`從 ${axis} 最大端面往內`,'max'));side.value=choice.side;row.append(side);
   const breakthrough=document.createElement('input');breakthrough.type='checkbox';breakthrough.checked=!!choice.allowBreakthrough;const approval=document.createElement('label');approval.append(breakthrough,document.createTextNode('已核對：依圖註孔深切除，允許穿出內腔'));if(!c.through)row.append(approval);
   const note=document.createElement('p');note.className='muted';note.textContent=c.warning;row.append(note);panel.append(row);
   const change=()=>{choice.enabled=check.checked;choice.side=side.value;choice.allowBreakthrough=breakthrough.checked;checked=false;el('mv-build').disabled=true;status('孔選擇已變更，請重新按「檢查視圖尺寸」核對。');};check.onchange=change;side.onchange=change;breakthrough.onchange=change;
  }
 }
 async function api(data){const r=await fetch('/api/studio/multiview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}
 function paint(){
  if(!drawing)return;const canvas=el('mv-canvas'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
  if(!drawing.profiles.length){status('尚未找出可選的完整外輪廓；需要先完成線條重建。');return;}
  const bounds=[Math.min(...drawing.profiles.map(p=>p.bounds[0])),Math.min(...drawing.profiles.map(p=>p.bounds[1])),Math.max(...drawing.profiles.map(p=>p.bounds[2])),Math.max(...drawing.profiles.map(p=>p.bounds[3]))];
  const scale=Math.min(850/(bounds[2]-bounds[0]),430/(bounds[3]-bounds[1]));transform={bounds,scale};
  function path(p){ctx.beginPath();p.outer.forEach(([x,y],i)=>{const u=25+(x-bounds[0])*scale,v=455-(y-bounds[1])*scale;i?ctx.lineTo(u,v):ctx.moveTo(u,v);});ctx.closePath();}
  ctx.strokeStyle='#83908c';ctx.lineWidth=.7;for(const p of drawing.profiles){path(p);ctx.stroke();}
  for(const [r,label,color]of roles){const id=el('mv-'+r).value;if(id==='')continue;const p=drawing.profiles.find(p=>p.id===Number(id));if(!p)continue;path(p);ctx.strokeStyle=color;ctx.lineWidth=3;ctx.stroke();ctx.fillStyle=color;ctx.fillText(label,25+(p.bounds[0]-bounds[0])*scale,450-(p.bounds[3]-bounds[1])*scale);}
 }
 el('mv-canvas').onclick=e=>{
  if(!drawing||!transform)return;const canvas=e.currentTarget,rect=canvas.getBoundingClientRect();
  const x=(e.clientX-rect.left)*canvas.width/rect.width,y=(e.clientY-rect.top)*canvas.height/rect.height;
  let best=null,distance=9;
  for(const p of drawing.profiles){const pts=p.outer.map(([u,v])=>[25+(u-transform.bounds[0])*transform.scale,455-(v-transform.bounds[1])*transform.scale]);
   for(let i=1;i<pts.length;i++){const [a,b]=pts[i-1],[c,d]=pts[i],dx=c-a,dy=d-b,t=Math.max(0,Math.min(1,((x-a)*dx+(y-b)*dy)/(dx*dx+dy*dy||1))),dist=Math.hypot(x-a-t*dx,y-b-t*dy);if(dist<distance){distance=dist;best=p;}}}
  if(best){el('mv-'+el('mv-role').value).value=String(best.id);invalidate();}
 };
 button.onclick=async()=>{
  if(busy)return;chat=current();if(!chat.drawing){note('請先附加 DWG／DXF。');return;}
  button.disabled=true;
  try{const r=await fetch('/api/studio/drawings/'+chat.drawing.id);drawing=await r.json();if(!r.ok)throw Error(drawing.error);if(drawing.format==='pdf')throw Error('PDF 請按「依圖面尺寸建立 STEP」使用本地看圖判讀；此工具僅供 DWG／DXF 向量輪廓。');
   el('mv-views').replaceChildren();
   for(const [role,label]of roles){const container=document.createElement('div'),l=document.createElement('label'),select=document.createElement('select');l.textContent=label;select.id='mv-'+role;select.add(new Option('尚未選取',''));
    for(const p of drawing.profiles){const w=p.bounds[2]-p.bounds[0],h=p.bounds[3]-p.bounds[1];select.add(new Option(`輪廓 ${p.id+1} · ${w.toFixed(2)} × ${h.toFixed(2)} 圖面單位 · ${p.layer}`,p.id));}
    select.onchange=invalidate;l.append(select);container.append(l);const flip=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.id='mv-flip-'+role;input.onchange=invalidate;flip.append(input,document.createTextNode('水平反轉'));container.append(flip);el('mv-views').append(container);}
   document.getElementById('mv-candidates')?.remove();
   const suggestions=document.createElement('select');suggestions.id='mv-candidates';suggestions.setAttribute('aria-label','依幾何對齊找到的視圖候選');suggestions.add(new Option('自動尋找的對齊視圖：請選取並核對',''));
   (drawing.multiviewCandidates||[]).forEach((v,i)=>suggestions.add(new Option(`候選 ${i+1}：主視圖＋${v.role==='top'?'俯視圖':'右視圖'} · ${v.reason}`,i)));
   suggestions.onchange=()=>{if(suggestions.value==='')return;const v=drawing.multiviewCandidates[Number(suggestions.value)];for(const [r]of roles)el('mv-'+r).value='';el('mv-front').value=String(v.front);el('mv-'+v.role).value=String(v.other);if(v.right!=null)el('mv-right').value=String(v.right);invalidate();};el('mv-views').before(suggestions);
   const effective=drawing.suggestedGeometryScale||drawing.suggestedScale||1;
   for(const o of [...el('mv-scale').options])if(o.dataset.inferred)o.remove();
   const inferred=new Option(`圖面推定：每向量單位 ${effective} mm（尺寸係數 ${(drawing.dimensionScaleFactors||[]).join('／')||'未知'}）`,String(effective));inferred.dataset.inferred='1';el('mv-scale').add(inferred,0);el('mv-scale').selectedIndex=0;
   el('mv-notes').textContent=(drawing.warnings||[]).join('\n')+(drawing.suggestedGeometryScale?'':' 不同視圖可能使用不同比例，請核對。');
   dialog.showModal();invalidate();if(drawing.multiviewCandidates?.length){suggestions.value='0';suggestions.onchange();status('已帶入第一組對齊候選，請核對彩色輪廓與方向，再按「檢查視圖尺寸」。');}
  }catch(e){note(e.message);}finally{button.disabled=false;}
 };
 window.openMultiview=()=>button.onclick();
 el('mv-scale').onchange=invalidate;el('mv-close').onclick=()=>dialog.close();
 el('mv-check').onclick=async()=>{try{const d=await api({...selection(),previewOnly:true});const evidence=d.parameters.views.flatMap(v=>v.dimensionEvidence.map(e=>e.label));showFeatures(d.parameters.featureCandidates||[]);status('共同外尺寸：'+d.parameters.expectedBounds.map(v=>v.toFixed(3)).join(' × ')+' mm。已選 '+d.parameters.features.length+' 個圖註孔槽特徵。'+(evidence.length?' 對應尺寸標註：'+evidence.join('、'):' 尚未找到可直接對應外輪廓的總尺寸標註，需核對向量尺寸。'));if(!d.parameters.features.length)status(el('mv-status').textContent+' 注意：目前未選任何孔槽，產出將只有外形。正反面特徵須各自選取視圖與進刀面。');checked=true;el('mv-build').disabled=false;}catch(e){status(e.message);}};
 el('mv-build').onclick=async()=>{if(!checked||busy)return;el('mv-build').disabled=true;el('mv-check').disabled=true;
  try{const j=await api({...selection(),acceptScope:true});chat.messages.push({role:'assistant',content:'已開始多視圖重建及已選孔特徵，將檢查外形投影與孔深。這是核對版，未選特徵及倒角仍未包含；螺紋未含配合公差。',jobId:j.id});save();dialog.close();render();}
  catch(e){status(e.message);el('mv-build').disabled=false;}finally{el('mv-check').disabled=false;}
 };
})();
