// STEP header metadata survives file delivery; CAD viewers need not display it.
export function annotateStep(text,skipped=[]){
 if(!Array.isArray(skipped)||skipped.some(v=>typeof v!=='string'||!v.trim()||v.length>2000)||skipped.length>100)throw Error('STEP 缺漏清單格式錯誤。');
 if(!skipped.length)return text;
 const note='未完成核對版；以下特徵因尺寸或定位未確認而未建模，不能視為完整加工模型：'+skipped.join('；');
 const encoded='\\X2\\'+Array.from({length:note.length},(_,i)=>note.charCodeAt(i).toString(16).padStart(4,'0').toUpperCase()).join('')+'\\X0\\';
 const pattern=/FILE_DESCRIPTION\s*\(\s*\(/;
 if(!pattern.test(text))throw Error('STEP 缺少檔案說明，無法寫入缺漏標示。');
 return text.replace(pattern,match=>match+"'"+encoded+"',");
}
