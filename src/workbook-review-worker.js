import {createSheetInventory,compareSheetPair,validateReviewBudget} from './workbook-sheet-review.cjs';
let epoch=0;
onmessage=async({data})=>{
 const ticket=++epoch,id=data?.id;
 try{
  if(data.action!=='start')throw Error('Unknown workbook review request.');
  const {sheetsA:a,sheetsB:b,options={}}=data,rows=createSheetInventory(a,b);validateReviewBudget(a,b);
  postMessage({id,type:'inventory',rows});
  const pending=rows.filter(row=>row.status==='not-compared');if(data.priorityId)pending.sort((x,y)=>Number(y.id===data.priorityId)-Number(x.id===data.priorityId));
  let completed=0;
  for(const row of pending){await new Promise(resolve=>setTimeout(resolve,0));if(ticket!==epoch)return;postMessage({id,type:'comparing',entryId:row.id});let result;
   try{result=compareSheetPair(a[row.aIndex],b[row.bIndex],options);}catch(error){result={status:'error',different:false,reasons:[error.message]};}
   if(ticket!==epoch)return;postMessage({id,type:'progress',entryId:row.id,result,completed:++completed,total:pending.length});
  }
  if(ticket===epoch)postMessage({id,type:'done',completed,total:pending.length});
 }catch(error){if(ticket===epoch)postMessage({id,type:'error',error:error.message});}
};
