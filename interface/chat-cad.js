(()=>{
 const inFlight=new Set(),recovered=new Set();
 const attachment=d=>({id:d.id,name:d.name,profileCount:d.profiles.length,format:d.format,pages:d.pages?.length});
 window.attachCadDrawing=d=>{const c=current();c.drawing=attachment(d);delete c.pendingConfirm;save();window.renderCadState(c);};
 window.renderCadState=c=>{
  $('chat-drawing-label').textContent=c.drawing?`已附加：${c.drawing.name}（${c.drawing.format==='pdf'?c.drawing.pages+' 頁 PDF':c.drawing.profileCount+' 個面域'}）`:'尚未附加圖面';
  $('chat-drawing-remove').hidden=!c.drawing;$('chat-drawing-remove').disabled=busy;$('chat-drawing-file').disabled=busy;
  $('chat-drawing-start').disabled=busy||!c.drawing;
  if(c.drawing&&!recovered.has(c.id)){recovered.add(c.id);recover(c).catch(()=>recovered.delete(c.id));}
  refresh(c);
 };
 async function recover(c){
  const r=await fetch('/api/cad-agent/session/'+c.id);if(!r.ok)return;const s=await r.json();if(s.drawingId!==c.drawing?.id)return;
  if(s.job&&!c.messages.some(m=>m.jobId===s.job.id)){c.messages.push({role:'assistant',content:'已找回這段對話的建模工作。',jobId:s.job.id});save();if(current()===c)render();}
  const existing=s.job&&c.messages.find(m=>m.jobId===s.job.id);if(existing&&existing.job?.status!==s.job.status){existing.job=s.job;save();if(current()===c)render();}
  if(s.plan&&!c.messages.some(m=>m.plan?.id===s.plan.id)){c.messages.push({role:'assistant',content:s.plan.summary,plan:s.plan});save();if(current()===c)render();}
 }
 $('chat-drawing-remove').onclick=()=>{if(busy)return;delete current().drawing;delete current().pendingConfirm;save();render();note('已解除這段聊天的附件；先前模型仍可下載。');};
 $('chat-drawing-start').onclick=()=>{if(busy||!current().drawing)return;$('input').value='請依附件工程圖內標示尺寸建立 STEP。先讀取圖面。未標尺寸的個別特徵跳過並在 STEP 註明，不要猜測；主體必要尺寸不足或尺寸衝突請指出。';send();};
 $('chat-drawing-file').onchange=async()=>{
  const f=$('chat-drawing-file').files[0];if(!f||busy)return;
  if(!/\.(dwg|dxf|pdf)$/i.test(f.name)||f.size>8*1024*1024){note('請選擇 8 MB 以下的 DWG、DXF 或 PDF。');return;}
  const c=current();busy=true;controller=new AbortController();render();note('正在本機讀取工程圖，請稍候…');
  try{const content=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(Error('檔案讀取失敗。'));r.readAsDataURL(f);});
   const r=await fetch('/api/studio/drawing-import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.name,content}),signal:controller.signal});const d=await r.json();if(!r.ok)throw Error(d.error);
   c.drawing=attachment(d);delete c.pendingConfirm;recovered.delete(c.id);
   c.messages.push({role:'assistant',pdfDrawingId:d.format==='pdf'?d.id:undefined,pdfPages:d.pages?.length,content:d.importNotice||(d.format==='pdf'?`已讀取「${d.name}」共 ${d.pages.length} 頁。按「依圖面尺寸建立 STEP」會使用本地視覺模型判讀；方案可執行並經確認後才建立實體。${d.warnings.join('；')}`:`已在本機讀取「${d.name}」，保留 ${d.profiles.length} 個面域、${d.dimensions?.length||0} 個尺寸標註。請按「依圖面尺寸建立 STEP」，先檢查圖上尺寸與工具是否能完成；不用先重填厚度。讀取成功不代表三維模型已完成。${d.warnings?.length?'\n'+d.warnings.join('\n'):''}`)});
   if(c.messages.length===1)c.title=f.name;save();note('圖面已附加，可以直接聊天。');
  }catch(e){note(e.name==='AbortError'?'已停止等待匯入。':e.message);}finally{busy=false;$('chat-drawing-file').value='';render();}
 };
 window.paintCadMessage=(el,m)=>{
  if(m.pdfDrawingId){for(let i=1;i<=m.pdfPages;i++){const img=document.createElement('img');img.src=`/api/studio/drawing-pages/${m.pdfDrawingId}/page-${i}.jpg`;img.alt=`PDF 工程圖第 ${i} 頁`;img.className='model-preview';el.append(img);}}
  if(m.multiviewDrawingId){const b=document.createElement('button');b.textContent='核對多視圖與孔槽';b.disabled=busy||current().drawing?.id!==m.multiviewDrawingId;b.onclick=()=>window.openMultiview?.();el.append(b);}
  if(m.plan){const button=document.createElement('button');button.textContent='確認建模';button.disabled=busy;button.onclick=()=>{if(busy)return;current().pendingConfirm=m.plan.id;$('input').value='確認建模';send();};el.append(button);}
  if(m.jobId){const card=document.createElement('div');card.className='chat-model';card.dataset.job=m.jobId;card.textContent='正在讀取建模狀態…';el.append(card);if(m.job)paintJob(card,m.job);}
 };
 function paintJob(card,j){card.replaceChildren();const p=document.createElement('p');p.textContent=j.status==='done'?`${j.type==='multiview'?'多視圖核對版已完成':'模型已完成'} · ${j.report.bounds.map(v=>v.toFixed(2)).join(' × ')} mm · 幾何檢查通過`:j.status==='failed'?j.error:(j.phase||'正在建模、檢查尺寸並產生預覽…');card.append(p);if(j.engine){const engine=document.createElement('p');engine.className='muted';engine.textContent='建模引擎：'+j.engine;card.append(engine);}
  if(j.status==='failed'){const retry=document.createElement('button');retry.type='button';retry.textContent='重新提出建模方案';retry.onclick=()=>{if(busy)return;$('input').value='請依原圖重新提出建模方案';send();};card.append(retry);return;}
  if(j.status!=='done')return;
  const base='/api/studio/files/'+j.id+'/';if(j.preview){const img=document.createElement('img');img.src=base+'preview.png';img.alt='已生成模型預覽';img.className='model-preview';card.append(img);}
  const viewer=document.createElement('div');const rotate=document.createElement('button');rotate.type='button';rotate.textContent='翻轉／旋轉檢視';card.append(rotate,viewer);
  rotate.onclick=async()=>{rotate.disabled=true;rotate.textContent='正在載入立體模型…';viewer.replaceChildren();try{await window.studioMeshView(viewer,base+'model.stl');const img=card.querySelector('img.model-preview');if(img)img.hidden=true;rotate.hidden=true;}catch(e){viewer.textContent=e.message;rotate.textContent='重新載入立體模型';}finally{rotate.disabled=false;}};
  const links=document.createElement('div');links.className='inline';const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='其他檔案與檢查資料';details.append(summary);for(const [file,label]of [['model.step','下載 STEP'],...(j.nativeFile?[['model.FCStd','下載 FreeCAD 可編輯檔']]:[]),['model.stl','下載 STL'],['report.json','下載檢查報告'],['parameters.json','下載建模參數']]){const a=document.createElement('a');a.href=base+file;a.textContent=label;if(['model.step','model.FCStd'].includes(file))links.append(a);else{details.append(a,document.createElement('br'));}}card.append(links,details);
  const note=document.createElement('p');note.className='muted';note.textContent=j.type==='multiview'?(j.report.scope||'多視圖核對版：未選特徵尚未完成。'):'請核對圖面與公差；幾何有效不等於已確認全部加工特徵。';card.append(note);
 }
 async function refresh(c){for(const m of c.messages){if(!m.jobId||m.job?.status==='done'||m.job?.status==='failed'||inFlight.has(m.jobId))continue;inFlight.add(m.jobId);
  try{const r=await fetch('/api/studio/jobs/'+m.jobId);if(!r.ok)continue;const j=await r.json();m.job={id:j.id,type:j.type,status:j.status,report:j.report,preview:j.preview,nativeFile:j.nativeFile,engine:j.engine,error:j.error,phase:j.phase};save();if(current()===c){for(const el of document.querySelectorAll('[data-job]'))if(el.dataset.job===j.id)paintJob(el,m.job);}}
  catch{}finally{inFlight.delete(m.jobId);}
 }}
 setInterval(()=>refresh(current()),2500);render();
})();
