// Chromium's native insertion can be expensive for very large textarea payloads.
// Keep ordinary editing native; only replace a cancellable bulk insertion.
export const BULK_TEXT_THRESHOLD=64*1024;
export function installBulkTextInput(area,{flush=()=>{},isComposing=()=>false}={}){
 let composing=false;
 const compositionStart=()=>{composing=true;},compositionEnd=()=>{composing=false;};
 function replace(event,text,inputType){
  if(event.defaultPrevented||!event.cancelable||event.isComposing||composing||isComposing()||area.disabled||area.readOnly||typeof text!=='string'||text.length<BULK_TEXT_THRESHOLD)return;
  const start=area.selectionStart,end=area.selectionEnd,scrollTop=area.scrollTop,scrollLeft=area.scrollLeft;
  if(!Number.isInteger(start)||!Number.isInteger(end))return;
  const insertion=text.replace(/\r\n?/g,'\n'),next=area.value.slice(0,start)+insertion+area.value.slice(end);
  event.preventDefault();flush();
  area.value=next;
  const caret=start+insertion.length;area.setSelectionRange(caret,caret);
  area.scrollTop=scrollTop;area.scrollLeft=scrollLeft;
  try{area.dispatchEvent(new InputEvent('input',{bubbles:true,inputType,data:insertion,isComposing:false}));}
  finally{flush();}
 }
 const beforeInput=event=>{if(event.inputType==='insertText'||event.inputType==='insertFromPaste')replace(event,event.data,event.inputType);};
 const paste=event=>{if(event.clipboardData?.types.includes('text/plain'))replace(event,event.clipboardData.getData('text/plain'),'insertFromPaste');};
 area.addEventListener('compositionstart',compositionStart);area.addEventListener('compositionend',compositionEnd);
 area.addEventListener('beforeinput',beforeInput);area.addEventListener('paste',paste);
 return ()=>{area.removeEventListener('compositionstart',compositionStart);area.removeEventListener('compositionend',compositionEnd);area.removeEventListener('beforeinput',beforeInput);area.removeEventListener('paste',paste);};
}
