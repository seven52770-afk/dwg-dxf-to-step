(()=>{
 let drawing=null;
 const el=id=>document.getElementById(id),status=t=>el('drawing-status').textContent=t;
 async function api(route,data){const r=await fetch('/api/studio/'+route,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});const v=await r.json();if(!r.ok)throw Error(v.error);return v;}
 const safe=fn=>async()=>{try{await fn();}catch(e){status(e.message);}};
 function preview(){
  const p=drawing?.profiles.find(p=>p.id===Number(el('drawing-profile').value)),c=el('drawing-preview'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);if(!p)return;
  const [x,y,r,t]=p.bounds,s=Math.min(640/(r-x),340/(t-y));ctx.beginPath();
  for(const ring of [p.outer,...p.holes]){ring.forEach(([a,b],i)=>{const u=30+(a-x)*s,v=370-(b-y)*s;i?ctx.lineTo(u,v):ctx.moveTo(u,v);});ctx.closePath();}
  ctx.fillStyle='#a4bea5';ctx.fill('evenodd');ctx.strokeStyle='#294b3c';ctx.stroke();
  const scale=Number(el('drawing-scale').value);el('drawing-size').textContent=`所選面域：${((r-x)*scale).toFixed(2)} × ${((t-y)*scale).toFixed(2)} mm，${p.holes.length} 個穿孔。請核對尺寸與面域後再建立。`;
 }
 function profiles(){const layer=el('drawing-layer').value;el('drawing-profile').replaceChildren();for(const p of drawing.profiles.filter(p=>p.layer===layer))el('drawing-profile').add(new Option(`面域 ${p.id+1} · ${p.holes.length} 孔 · 面積 ${p.area.toFixed(2)} 圖面單位²`,p.id));preview();}
 el('drawing-layer').onchange=profiles;el('drawing-profile').onchange=preview;el('drawing-scale').onchange=preview;
 el('drawing-import').onclick=safe(async()=>{
  const f=el('drawing-file').files[0];if(!f)throw Error('請選擇 DWG 或 DXF 檔案。');if(f.size>8*1024*1024)throw Error('檔案上限為 8 MB。');
  el('drawing-import').disabled=true;el('drawing-build').disabled=true;drawing=null;window.currentDrawingId=null;status('正在讀取工程圖與尋找封閉面域…');
  try{const content=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(f);});
   drawing=await api('drawing-import',{name:f.name,content});window.currentDrawingId=drawing.id;window.attachCadDrawing?.(drawing);el('skill-select').value='drawing-solid';el('skill-description').textContent='工程圖技能已啟用；接下來的聊天可參考已匯入圖面的分析摘要。';el('drawing-layer').replaceChildren();for(const l of [...new Set(drawing.profiles.map(p=>p.layer))])el('drawing-layer').add(new Option(l,l));
   el('drawing-scale').value=drawing.suggestedScale||1;profiles();el('drawing-build').disabled=!drawing.profiles.length;
   status(`${drawing.profiles.length} 個封閉面域。${drawing.suggestedScale?'已帶入圖面單位，仍請核對尺寸。':'圖面未提供支援的單位，請手動確認比例！'} ${drawing.notice} 忽略物件：${Object.entries(drawing.ignored).map(([k,v])=>k+' '+v).join('、')||'無'}`);
  }finally{el('drawing-import').disabled=false;}
 });
 el('drawing-build').onclick=safe(async()=>{
  if(!drawing)throw Error('請先匯入圖面。');const projectId=window.drawingBridge.requireProject();
  el('drawing-build').disabled=true;try{const job=await api('cad',{projectId,type:'drawing',parameters:{drawingId:drawing.id,profileId:Number(el('drawing-profile').value),scale:Number(el('drawing-scale').value),height:Number(el('drawing-height').value)}});await window.drawingBridge.refresh();await window.drawingBridge.poll(job.id);status('已開始拉伸與幾何檢查；完成結果會顯示在下方「參數化建模工具」。');}finally{el('drawing-build').disabled=false;}
 });
 safe(async()=>{const s=await api('drawing-status');el('drawing-support').textContent=s.dwg?'DWG 轉檔器已就緒；DWG、DXF 均在本機處理。':'DXF 已就緒；DWG 需要完成轉檔器安裝。';})();
})();
