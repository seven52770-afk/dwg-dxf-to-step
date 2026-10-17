import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
export async function converter(){
 const root='C:/Program Files/ODA';
 try{for(const folder of (await fs.readdir(root)).sort().reverse()){const p=path.join(root,folder,'ODAFileConverter.exe');try{await fs.access(p);return p;}catch{}}}catch{}
 return null;
}
export async function importDrawing(d,root,execute,base){
 if(typeof d.name!=='string'||!/^.+\.(dxf|dwg|pdf)$/i.test(d.name)||typeof d.content!=='string'||d.content.length>12000000||! /^[A-Za-z0-9+/]*={0,2}$/.test(d.content))throw Error('請選擇 8 MB 以下的 DWG、DXF 或 PDF。');
 const bytes=Buffer.from(d.content,'base64');if(bytes.length>8*1024*1024)throw Error('圖面超過 8 MB，請先另存單一零件。');
 const id=randomUUID(),dir=path.join(root,'drawings',id);await fs.mkdir(dir,{recursive:true});
 if(/\.pdf$/i.test(d.name)){
  if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('PDF 檔頭無效。');
  await fs.writeFile(path.join(dir,'source.pdf'),bytes);
  const python=process.env.JIMMY_STUDIO_PYTHON||'python';
  try{await run(python,[path.join(base,'cad','read_pdf.py'),dir],{windowsHide:true,timeout:90000,maxBuffer:2*1024*1024,env:{...process.env,PYTHONUTF8:'1'}});}catch(e){await fs.writeFile(path.join(dir,'error.log'),String(e.stderr||e.message));throw Error('PDF 讀取失敗，請確認未加密、沒有損毀，並保留同一零件的 1～3 頁。');}
 }else if(/\.dwg$/i.test(d.name)){
  if(!bytes.subarray(0,6).toString().match(/^AC10\d\d$/))throw Error('DWG 檔頭無效，請確認檔案格式。');
  const exe=await converter();if(!exe)throw Error('DWG 轉檔器尚未安裝完成；目前可先另存 DXF 後匯入。');
  const input=path.join(dir,'input');await fs.mkdir(input);await fs.writeFile(path.join(input,'source.dwg'),bytes);
  try{await run(exe,[input,dir,'ACAD2018','DXF','0','1','*.dwg'],{windowsHide:true,timeout:90000,maxBuffer:1024*1024});}catch{throw Error('DWG 轉檔失敗，請用原 CAD 軟體另存 DXF 再試。');}
 }else await fs.writeFile(path.join(dir,'source.dxf'),bytes);
 try{if(!/\.pdf$/i.test(d.name))await execute(['python',path.join(base,'cad','analyze_drawing.py'),dir],dir);}catch(e){await fs.writeFile(path.join(dir,'error.log'),String(e.stderr||e.message));throw Error('圖面分析未完成：請使用模型空間的平面輪廓，並移除過多圖框、圖塊或不支援物件。');}
 const result=JSON.parse(await fs.readFile(path.join(dir,'analysis.json'),'utf8'));
 result.name=d.name.slice(0,160);result.sha256=createHash('sha256').update(bytes).digest('hex');
 await fs.writeFile(path.join(dir,'analysis.json'),JSON.stringify(result));
 return {...result,id,name:d.name};
}
export async function drawingParameters(d,root){
 if(!/^[a-f0-9-]{36}$/.test(d.drawingId||''))throw Error('請先匯入工程圖。');
 const a=JSON.parse(await fs.readFile(path.join(root,'drawings',d.drawingId,'analysis.json'),'utf8'));
 const p=a.profiles.find(p=>p.id===d.profileId),scale=Number(d.scale),height=Number(d.height);
 if(!p||!Number.isFinite(scale)||scale<=0||scale>1000||!Number.isFinite(height)||height<=0||height>300)throw Error('請選擇面域、確認單位與厚度（0～300 mm）。');
 const length=(p.bounds[2]-p.bounds[0])*scale,width=(p.bounds[3]-p.bounds[1])*scale;
 if(Math.min(length,width)<0.1||Math.max(length,width)>1000)throw Error('外形須介於 0.1～1,000 mm，請確認圖面比例。');
 const points=r=>r.map(([x,y])=>[(x-p.bounds[0])*scale,(y-p.bounds[1])*scale]);
 return {length,width,height,area:p.area*scale*scale,outer:points(p.outer),holes:p.holes.map(points),drawingId:d.drawingId,layer:p.layer,scale};
}
