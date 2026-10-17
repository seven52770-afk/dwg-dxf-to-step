import fs from 'node:fs/promises';
export async function reviewedPlan(drawing,drawingId){
 if(!/^[a-f0-9]{64}$/.test(drawing.sha256||''))return null;
 let saved;
 try{saved=JSON.parse(await fs.readFile(new URL('../cad/reviewed/'+drawing.sha256+'.json',import.meta.url),'utf8'));}
 catch(e){if(e.code==='ENOENT')return null;throw e;}
 if(saved.sourceHash!==drawing.sha256||saved.geometryFingerprint!==drawing.geometryFingerprint||saved.validation?.passed!==true||saved.type!=='multiview')return null;
 return {...saved,parameters:{...saved.parameters,drawingId,sourceName:drawing.name}};
}
