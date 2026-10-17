export const skills=[
 {id:'drawing-solid',name:'工程圖轉實體',description:'確認圖面單位、封閉輪廓、厚度與待補特徵',role:'jimmy-cad'},
 {id:'creative-project',name:'創作專案',description:'整理需求、延續靈感與修改紀錄',role:'jimmy-creator'},
 {id:'parametric-cad',name:'參數化建模',description:'尺寸討論與可下載的 STEP／STL 模型',role:'jimmy-cad'},
 {id:'order-quote',name:'接單報價',description:'成本試算、需求確認與客戶回覆',role:'jimmy-orders'}
];
export const cadFields={
 rack:{name:'刀具收納架',fields:[['length','長度',90],['width','寬度',60],['height','高度',25],['cols','每排孔數',3],['rows','排數',2],['diameter','孔徑',12],['depth','盲孔深度',20]]},
 cap:{name:'開口保護蓋',fields:[['length','外長',60],['width','外寬',40],['height','外高',20],['wall','壁厚與頂板厚',3]]},
 bracket:{name:'直角支架',fields:[['length','底板長度',60],['width','寬度',30],['height','總高度',45],['wall','板厚',5]]}
};
export function quote(v){
 const bounds={quantity:[1,10000],grams:[0,100000],priceKg:[0,100000],hours:[0,10000],hourRate:[0,100000],waste:[0,100],post:[0,100000],design:[0,10000000],shipping:[0,10000000],markup:[0,1000]};
 const p={};for(const [k,[min,max]] of Object.entries(bounds)){if(typeof v[k]!=='number'||!Number.isFinite(v[k])||v[k]<min||v[k]>max)throw Error('請填入有效且非負的報價數值。');p[k]=v[k];}if(!Number.isInteger(p.quantity))throw Error('數量必須是整數。');
 const material=p.grams/1000*p.priceKg, machine=p.hours*p.hourRate, loss=(material+machine)*p.waste/100, each=material+machine+loss+p.post, cost=each*p.quantity+p.design+p.shipping, total=cost*(1+p.markup/100);
 return {inputs:p,material,machine,loss,each,cost,total,unit:total/p.quantity,currency:'TWD',taxIncluded:false};
}
export function validateCad(type,v){
 if(!cadFields[type])throw Error('請選擇有效的建模模板。');const p={};for(const [k,label] of cadFields[type].fields){if(typeof v[k]!=='number'||!Number.isFinite(v[k])||v[k]<=0||v[k]>300)throw Error(`${label}必須大於 0 且不超過 300。`);p[k]=v[k];}
 if(type==='rack'){
  if(!Number.isInteger(p.cols)||!Number.isInteger(p.rows)||p.cols*p.rows>64)throw Error('孔數必須是整數，總孔數不超過 64。');
  if(p.depth>p.height-2)throw Error('盲孔底部至少保留 2 mm。');
  const sx=p.length/(p.cols+1),sy=p.width/(p.rows+1);
  if(sx-p.diameter/2<2||sy-p.diameter/2<2||(p.cols>1&&sx-p.diameter<2)||(p.rows>1&&sy-p.diameter<2))throw Error('孔距或邊距太小，孔與孔、孔與邊緣至少保留 2 mm。');
 }else if(p.wall<1||2*p.wall>=Math.min(p.length,p.width)||p.wall>=p.height)throw Error('板厚至少 1 mm，且必須小於外形可容納的厚度。');
 return p;
}
