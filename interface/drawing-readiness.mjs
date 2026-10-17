// Report tool limitations before asking the language model to invent a plan.
export function drawingReadiness(drawing){
 const dimensions=drawing.dimensions||[],notes=drawing.featureNotes||[],reasons=[];
 if(drawing.profileAnalysisComplete===false)reasons.push(...(drawing.warnings||[]));
 const threads=notes.filter(n=>/M\s*\d+(?:\.\d+)?\s*[xX×]\s*\d/i.test(n.text));
 if(!reasons.length)return null;
 const labels=[...new Set(dimensions.map(d=>d.display_text||d.text||String(d.geometric_measurement??'')).filter(Boolean))];
 const shown=labels.slice(0,40);
 const text=[`「${drawing.name||'附件圖面'}」已讀取，尚未建立 STEP。`,
  `已讀到 ${dimensions.length} 個尺寸標註、${drawing.annotations?.length||0} 則文字／圖塊註記。`,
  `圖上標註（尚未全部對應到三維特徵）：${shown.join('、')}${labels.length>shown.length?'；其餘已保存在圖面分析中':''}。`,
  drawing.units===1?'檔頭單位是英吋；須與圖面標示單位交叉核對，不能直接假定為毫米。':'',
  '目前卡住的是：',...reasons.map(r=>'• '+r),
  threads.length?'相關圖註：'+threads.slice(0,6).map(n=>n.text).join('；'):'',
  '這是目前解析／建模工具的能力限制，不是要求你重填圖上已有的尺寸。此狀態沒有啟動建模，也不會產生下載按鈕。需要完成視圖與特徵的重建後，才能輸出符合圖面的 STEP；只輸入厚度不能解決。'
 ].filter(Boolean).join('\n');
 return {text,reasons,dimensionCount:dimensions.length};
}
