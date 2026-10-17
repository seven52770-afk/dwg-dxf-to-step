export function mappedCoordinate(value,anchors){
 if(!anchors?.length)return value;
 for(let i=1;i<anchors.length;i++){const a=anchors[i-1],b=anchors[i];if(value<=b[0]+1e-9)return a[1]+(value-a[0])*(b[1]-a[1])/(b[0]-a[0]);}
 return anchors.at(-1)[1];
}
export function coordinateEvidence(drawing,profile,scale){
 const unit=drawing.labelUnitScale||1,result={x:[],y:[],evidence:[]};
 for(const [k,key]of [[0,'x'],[1,'y']]){
  const extent=(profile.bounds[k+2]-profile.bounds[k])*scale,anchors=[[0,0],[extent,extent]];
  for(const d of drawing.dimensions||[]){
   if(d.kind!=='ordinate'||d.axis!==(k===0?'X':'Y')||!d.defpoint||!d.defpoint2||Math.abs(d.defpoint[k]-profile.bounds[k])>.02)continue;
   const source=(d.defpoint2[k]-profile.bounds[k])*scale;
   if(source<-.001||source>extent+.001)continue;
   const label=d.display_text||'',match=label.match(/^\s*(\d+(?:\.\d+)?)/);if(!match)continue;
   const target=Number(match[1])*unit,precision=(match[1].split('.')[1]||'').length;
   const tolerance=Math.max(.02,Math.min(.1,.5*10**(-precision)*unit));
   if(Math.abs(source-target)>tolerance+1e-6)throw Error(`座標標註 ${label} 與圖面比例後的位置 ${source.toFixed(3)} mm 不符，不能任意扭曲視圖。`);
   const old=anchors.find(a=>Math.abs(a[0]-source)<1e-5);
   if(old){if(old.length>2&&Math.abs(old[1]-target)>1e-5)throw Error('相同座標有互相矛盾的尺寸標註。');old[1]=target;old[2]=d.handle;}
   else anchors.push([source,target,d.handle]);
   result.evidence.push({axis:d.axis,label,from:d.defpoint,to:d.defpoint2,source_mm:source,nominal_mm:target});
  }
  anchors.sort((a,b)=>a[0]-b[0]);
  for(let i=1;i<anchors.length;i++)if(anchors[i][1]<=anchors[i-1][1])throw Error('座標標註順序矛盾，無法建立尺寸對應。');
  result[key]=anchors;
 }
 return result;
}
