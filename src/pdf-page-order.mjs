// Page rows v1: explicit displayed horizontal LTR geometry, never column inference.
export const ORDER_VERSION=1;
const error=(code,message)=>Object.assign(Error(message),{code});
const unsupported=message=>{throw error('DOCUMENT_ORDER_UNSUPPORTED','Page rows: '+message+' Use Document order for this PDF.');};
const finiteMatrix=value=>Array.isArray(value)&&value.length===6&&value.every(Number.isFinite);
export function orderPdfPageItems(items,{viewport,signal,maxItems=1000000,maxOutputBytes=8*1024*1024}={}){
 const check=()=>{if(signal?.aborted)throw error('DOCUMENT_CANCELLED','PDF extraction cancelled.');};check();
 if(!Array.isArray(items)||!Number.isInteger(maxItems)||maxItems<0||maxItems>1000000||!Number.isInteger(maxOutputBytes)||maxOutputBytes<0||maxOutputBytes>8*1024*1024||items.length>maxItems)throw error('DOCUMENT_LIMIT','PDF page ordering exceeds its item limits.');
 if(!finiteMatrix(viewport?.transform))unsupported('Invalid page viewport.');
 const [a,b,c,d,e,f]=viewport.transform,scaleX=Math.hypot(a,b),scaleY=Math.hypot(c,d);
 if(!Number.isFinite(scaleX)||!Number.isFinite(scaleY)||!scaleX||!scaleY||Math.abs(a*c+b*d)>1e-6*scaleX*scaleY||Math.abs(scaleX-scaleY)>1e-6*Math.max(scaleX,scaleY))unsupported('Skewed or nonuniform viewport.');
 const encoder=new TextEncoder(),positioned=[];let size=0;
 for(const item of items){check();if(typeof item?.str!=='string')continue;if(item.str==='')continue;
  if(item.str.length>maxOutputBytes)throw error('DOCUMENT_LIMIT','PDF ordered text exceeds its output limit.');
  size+=encoder.encode(item.str).length;if(size>maxOutputBytes)throw error('DOCUMENT_LIMIT','PDF ordered text exceeds its output limit.');
  if(item.dir!=='ltr'||/[\r\n\0]/.test(item.str))unsupported('Vertical, right-to-left or multiline text items are unsupported.');
  if(!finiteMatrix(item.transform)||!Number.isFinite(item.width)||item.width<0)unsupported('Invalid text geometry.');
  const [u,v,w,z,x,y]=item.transform,bx=a*u+c*v,by=b*u+d*v,hx=a*w+c*z,hy=b*w+d*z;
  const length=Math.hypot(bx,by),height=Math.hypot(hx,hy),left=a*x+c*y+e,baseline=b*x+d*y+f,width=item.width*scaleX;
  if(!Number.isFinite(length)||!Number.isFinite(height)||!length||!height||bx<=0||hy>=0||Math.abs(by)>1e-6*length||Math.abs(hx)>1e-6*height||![left,baseline,width,left+width].every(Number.isFinite))unsupported('Sideways, skewed or invalid text geometry.');
  if(width===0&&item.str.trim())unsupported('Nonempty text has zero width.');
  positioned.push({str:item.str,left,right:left+width,baseline,height});
 }
 if(!positioned.length)return '';
 // Sorting never uses source index. Coincident visible strings are rejected below.
 let comparisons=0;positioned.sort((x,y)=>{if(!(++comparisons%1024))check();return x.baseline-y.baseline||x.left-y.left||x.right-y.right||x.height-y.height||(x.str<y.str?-1:x.str>y.str?1:0);});
 const rows=[];for(const item of positioned){check();let row=rows.at(-1);if(!row||item.baseline-row.baseline>0.15*Math.min(row.height,item.height)){row={baseline:item.baseline,height:item.height,items:[]};rows.push(row);}else row.height=Math.min(row.height,item.height);row.items.push(item);}
 const output=[];let previousRow=null;
 for(const row of rows){check();row.items.sort((x,y)=>{if(!(++comparisons%1024))check();return x.left-y.left||x.right-y.right||(x.str<y.str?-1:x.str>y.str?1:0);});let previous=null,previousInk=null;
  // Near-coincident baselines with overlapping horizontal ink are ambiguous
  // (superscripts/overprints), not confidently separate page rows.
  if(previousRow&&row.baseline-previousRow.baseline<0.5*Math.min(row.height,previousRow.height)){
   let i=0,j=0;while(i<previousRow.items.length&&j<row.items.length){const x=previousRow.items[i],y=row.items[j];if(x.str.trim()&&y.str.trim()&&Math.min(x.right,y.right)-Math.max(x.left,y.left)>0.01)unsupported('Overlapping baselines are ambiguous.');if(x.right<y.right)i++;else j++;}
  }
  if(previousRow){output.push('\n');if(++size>maxOutputBytes)throw error('DOCUMENT_LIMIT','PDF ordered text exceeds its output limit.');}
  for(const item of row.items){check();if(item.str.trim()){if(previousInk&&item.left<previousInk.right-0.01)unsupported('Overlapping text items are ambiguous.');previousInk=item;}if(previous){const gap=item.left-previous.right;if(gap<-0.01&&previous.str.trim()&&item.str.trim())unsupported('Overlapping text items are ambiguous.');if(gap>=Math.max(0.5,0.2*Math.min(previous.height,item.height))&&!/\s$/.test(previous.str)&&!/^\s/.test(item.str)){output.push(' ');if(++size>maxOutputBytes)throw error('DOCUMENT_LIMIT','PDF ordered text exceeds its output limit.');}}output.push(item.str);previous=item;}
  previousRow=row;
 }
 check();return output.join('');
}

// Explicit geometric columns policy; never changes the Page rows v1 contract.
export const COLUMN_ORDER_VERSION=1;
export function orderPdfPageColumns(items,options={}){
 const rowText=orderPdfPageItems(items,options);
 const {viewport,signal,maxOutputBytes=8*1024*1024}=options;
 const check=()=>{if(signal?.aborted)throw error('DOCUMENT_CANCELLED','PDF extraction cancelled.');};
 const [a,b,c,d,e,f]=viewport.transform,scale=Math.hypot(a,b),positioned=[];
 for(const item of items){check();if(typeof item?.str!=='string'||!item.str)continue;const [, ,w,z,x,y]=item.transform;const left=a*x+c*y+e;positioned.push({item,left,right:left+item.width*scale,baseline:b*x+d*y+f,height:Math.hypot(a*w+c*z,b*w+d*z)});}
 if(!positioned.length)return rowText;
 let comparisons=0;
 const compare=(fn)=>(x,y)=>{if(!(++comparisons%1024))check();return fn(x,y);};
 positioned.sort(compare((x,y)=>x.baseline-y.baseline||x.left-y.left||x.right-y.right||x.height-y.height||(x.item.str<y.item.str?-1:x.item.str>y.item.str?1:0)));
 const rows=[];
 for(const item of positioned){check();let row=rows.at(-1);if(!row||item.baseline-row.baseline>0.15*Math.min(row.height,item.height)){row={baseline:item.baseline,height:item.height,items:[]};rows.push(row);}else row.height=Math.min(row.height,item.height);row.items.push(item);}
 let work=0;const workLimit=Math.max(1024,positioned.length*16),ordered=[];
 const gutter=block=>{
  const events=[],heights=[],rightRows=new Map(),leftRows=new Map();
  let rightCount=0,leftCount=0,crossing=0;
  for(let row=0;row<block.length;row++)for(const item of block[row].items){check();if(!item.item.str.trim())continue;events.push({x:item.left,start:true,row},{x:item.right,start:false,row});heights.push(item.height);rightRows.set(row,(rightRows.get(row)||0)+1);}
  rightCount=rightRows.size;if(rightCount<2)return null;
  heights.sort(compare((x,y)=>x-y));const minimum=Math.max(12*scale,2*heights[Math.floor(heights.length/2)]);
  events.sort(compare((x,y)=>x.x-y.x));let best=null;
  for(let i=0;i<events.length;){check();const x=events[i].x;
   while(i<events.length&&events[i].x===x){const event=events[i++];if(event.start){const count=rightRows.get(event.row)-1;rightRows.set(event.row,count);if(!count)rightCount--;crossing++;}else{const count=leftRows.get(event.row)||0;leftRows.set(event.row,count+1);if(!count)leftCount++;crossing--;}}
   if(i===events.length)break;const width=events[i].x-x,support=Math.min(leftCount,rightCount);
   if(width<minimum||support<2)continue;
   const candidate={x:x+width/2,width,support,crossing};
   if(!best||candidate.crossing<best.crossing||candidate.crossing===best.crossing&&(candidate.support>best.support||candidate.support===best.support&&(candidate.width>best.width||candidate.width===best.width&&candidate.x<best.x)))best=candidate;
  }
  return best?.x??null;
 };
 const visit=(block,depth=0)=>{
  check();if(!block.length)return;for(const row of block)work+=row.items.length;
  if(depth>16||work>workLimit)throw error('DOCUMENT_LIMIT','PDF column ordering exceeds its layout work limit.');
  const split=gutter(block);if(split===null){for(const row of block)ordered.push(row);return;}
  let band=[];
  const flush=()=>{if(!band.length)return;const left=[],right=[];for(const row of band){const l=[],r=[];for(const item of row.items){if(!item.item.str.trim()&&item.left<split&&item.right>split)continue;(item.left+item.right<2*split?l:r).push(item);}if(l.length)left.push({...row,items:l});if(r.length)right.push({...row,items:r});}band=[];visit(left,depth+1);visit(right,depth+1);};
  for(const row of block){check();if(row.items.some(item=>item.item.str.trim()&&item.left<split&&item.right>split)){flush();ordered.push(row);}else band.push(row);}flush();
 };
 visit(rows);
 const output=[],encoder=new TextEncoder();let bytes=0;
 for(const row of ordered){check();const text=orderPdfPageItems(row.items.map(value=>value.item),options);bytes+=encoder.encode(text).length+(output.length?1:0);if(bytes>maxOutputBytes)throw error('DOCUMENT_LIMIT','PDF ordered text exceeds its output limit.');output.push(text);}
 check();return output.join('\n');
}
