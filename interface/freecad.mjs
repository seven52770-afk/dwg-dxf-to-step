import fs from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
export async function freecadPython(job){
 if(job.type!=='multiview'&&(job.type!=='plan'||!job.parameters.operations?.length||job.parameters.operations.some(o=>!['box','cylinder','profile','thread_hole','fillet','chamfer'].includes(o.kind))))return null;
 let config;try{config=JSON.parse(await fs.readFile(new URL('../freecad.json',import.meta.url),'utf8'));}
 catch(e){if(e.code==='ENOENT')return null;throw e;}
 await fs.access(config.python);return config.python;
}
export async function buildFreecad(python,dir,type){
 await fs.copyFile(new URL(type==='multiview'?'../cad/freecad_multiview.py':'../cad/freecad_plan.py',import.meta.url),dir+'/model.py');
 await fs.copyFile(new URL('../cad/freecad_threads.py',import.meta.url),dir+'/freecad_threads.py');
 return run(python,[dir+'/model.py'],{cwd:dir,windowsHide:true,timeout:180000,maxBuffer:2*1024*1024,env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}});
}
