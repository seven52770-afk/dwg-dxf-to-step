import {plannerSchema} from './cad-plan.mjs';

const strings={type:'array',items:{type:'string'}};
export const pdfPlannerSchema={...plannerSchema,properties:{...plannerSchema.properties,
 missingDimensions:strings,unsupportedFeatures:strings,skippedFeatures:strings,blockingDimensions:strings,
 dimensionEvidence:{type:'array',items:{type:'object',properties:{operation:{type:'integer'},source:{type:'string',enum:['drawing','user','derived']},position:{type:'string'},size:{type:'string'}},required:['operation','source','position','size']}}
},required:[...plannerSchema.required,'missingDimensions','unsupportedFeatures','dimensionEvidence','skippedFeatures','blockingDimensions']};

export function checkPdfPlan(plan,{skipMissing=false}={}){
 if(!plan||!['plan','question'].includes(plan.decision))throw Error('PDF 方案格式不完整，尚未建模。');
 for(const field of ['missingDimensions','unsupportedFeatures','assumptions']){
  if(!Array.isArray(plan[field])||plan[field].some(v=>typeof v!=='string'))throw Error('PDF 缺少完整尺寸核對清單，尚未建模。');
 }
 let missing=plan.missingDimensions.filter(v=>v.trim());const unsupported=plan.unsupportedFeatures.filter(v=>v.trim());
 if(skipMissing){
  for(const key of ['skippedFeatures','blockingDimensions'])if(!Array.isArray(plan[key])||plan[key].some(v=>typeof v!=='string'))throw Error('缺少跳過特徵與主體尺寸核對清單。');
  missing=[...missing.filter(v=>!plan.skippedFeatures.includes(v)),...plan.blockingDimensions];
  if(plan.skippedFeatures.some(v=>!plan.missingDimensions.includes(v)))throw Error('跳過項目必須對應未標尺寸特徵。');
 }
 // Do not trust a model's decision when its own evidence contains unresolved work.
 if(missing.length||unsupported.length){return {...plan,decision:'question',operations:[],expectedBounds:[],message:[missing.length?`需要核對：${missing[0]}`:'',unsupported.length?`工具尚未支援：${unsupported.join('；')}`:'','主體必要資料或工具能力仍不足，未啟動建模；不估算缺少尺寸。'].filter(Boolean).join('\n')};}
 if(plan.decision==='question')return {...plan,operations:[],expectedBounds:[]};
 if(!Array.isArray(plan.operations)||!plan.operations.length||!Array.isArray(plan.dimensionEvidence))throw Error('PDF 尚未提供建模步驟的尺寸來源，未啟動建模。');
 if(plan.assumptions.some(v=>/估算|假設|猜測|省略|忽略|簡化|未標|未知|未確認|推測|assum|estimat|omit|guess|approx/i.test(v)))throw Error('PDF 方案仍含未確認尺寸或省略特徵，已停止建模。');
 for(let i=0;i<plan.operations.length;i++){
  if(!['box','cylinder','thread_hole','fillet','chamfer'].includes(plan.operations[i].kind))throw Error('PDF 方案使用尚未支援的幾何，未啟動建模。');
  const evidence=plan.dimensionEvidence.filter(e=>e&&e.operation===i);
  if(evidence.length!==1||!['drawing','user','derived'].includes(evidence[0].source)||typeof evidence[0].position!=='string'||!evidence[0].position.trim()||typeof evidence[0].size!=='string'||!evidence[0].size.trim())throw Error(`第 ${i+1} 步缺少孔位／位置或大小的尺寸依據，未啟動建模。`);
 }
 return plan;
}
