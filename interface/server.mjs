import {drawingConversation,agentRoute} from './cad-agent.mjs';
import http from 'node:http';
import fs from 'node:fs/promises';
import {studioRoute,chatContext} from './studio.mjs';
const port=17863, origin=`http://127.0.0.1:${port}`;
const roles=['jimmy-creator','jimmy-cad','jimmy-orders'];
const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css'],'/workspace.js':['workspace.js','text/javascript'],'/drawing.js':['drawing.js','text/javascript'],'/chat-cad.js':['chat-cad.js','text/javascript'],'/multiview.js':['multiview.js','text/javascript']};
const server=http.createServer(async(req,res)=>{
  const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  if(req.headers.host!==`127.0.0.1:${port}`|| (req.headers.origin&&req.headers.origin!==origin))return json(403,{error:'此介面只接受本機操作。'});
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
  try{
    if(await agentRoute(req,res))return;
    if(await studioRoute(req,res))return;
    if(req.method==='GET'&&files[req.url]){const [file,type]=files[req.url];res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});return res.end(await fs.readFile(new URL(file,import.meta.url)));}
    if(req.method==='GET'&&req.url==='/api/status'){
      const r=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(4000)});if(!r.ok)throw Error();
      const d=await r.json();return json(200,{ready:roles.every(role=>d.models.some(m=>m.name===role+':latest'))});
    }
    if(req.method==='POST'&&req.url==='/api/chat'){
      if(!req.headers['content-type']?.startsWith('application/json'))return json(400,{error:'請使用正確的訊息格式。'});
      let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>200000)return json(413,{error:'對話太長，請開啟新對話。'});}
      let data;try{data=JSON.parse(raw);}catch{return json(400,{error:'訊息格式有誤。'});}
      if(!roles.includes(data.model)||!Array.isArray(data.messages)||data.messages.length>120||data.messages.some(m=>!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>16000))return json(400,{error:'訊息過長或角色無效，請開啟新對話。'});
      const controller=new AbortController();res.on('close',()=>controller.abort());
      if(data.drawingId){
        res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store'});
        const emit=d=>{if(!res.destroyed)res.write(JSON.stringify(d)+'\n');};
        try{const result=await drawingConversation(data,controller.signal,message=>emit({progress:message}));emit({message:{content:result.text},studio:{plan:result.plan,jobId:result.jobId,multiviewDrawingId:result.multiviewDrawingId}});emit({done:true});}
        catch(e){if(!controller.signal.aborted)emit({error:/[\u3400-\u9fff]/.test(e.message)?e.message:'規劃或建模未完成，請稍後重試。'});}
        return res.end();
      }
      const context=await chatContext(data);
      const messages=context?[{role:'system',content:'請使用台灣繁體中文。\n'+context},...data.messages]:data.messages;
      const upstream=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:data.model,messages,stream:true,options:{num_ctx:4096,num_predict:Math.min(2048,Math.max(128,Number(data.length)||1024)),temperature:Math.min(1,Math.max(0,Number(data.temperature)||0.4))}}),signal:controller.signal});
      if(!upstream.ok)return json(502,{error:'模型尚未就緒，請稍後再試。'});
      res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store'});
      for await(const chunk of upstream.body){if(res.destroyed)break;res.write(chunk);}return res.end();
    }
    json(404,{error:'找不到這個功能。'});
  }catch{if(!res.headersSent)json(503,{error:'無法連線本地模型。請重新執行「開啟本地AI」，稍候再試。'});else res.end();}
});
server.listen(port,'127.0.0.1',()=>console.log('繁體中文創作工作室：'+origin));
