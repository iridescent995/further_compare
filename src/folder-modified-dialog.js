function localDateValue(value){
 const date=new Date(value),pad=(number,width=2)=>String(number).padStart(width,'0');
 return `${pad(date.getFullYear(),4)}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(),3)}`;
}
function parseLocalDate(value){
 const match=/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.(\d{1,3}))?)?$/.exec(value);
 if(!match)throw Error('Choose a valid local date and time.');
 const [year,month,day,hour,minute,second]=match.slice(1,7).map(value=>Number(value||0)),millisecond=Number((match[7]||'').padEnd(3,'0'));
 const date=new Date(0);date.setFullYear(year,month-1,day);date.setHours(hour,minute,second,millisecond);
 if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day||date.getHours()!==hour||date.getMinutes()!==minute||date.getSeconds()!==second||!Number.isFinite(date.getTime())||date.getTime()<-62135596800000||date.getTime()>253402300799999)throw Error('Choose a valid local date and time between years 1 and 9999.');
 return date.getTime();
}
export function createFolderModifiedDialog(){
 const dialog=document.createElement('dialog');dialog.id='folderModifiedDialog';dialog.className='alignment-dialog';dialog.setAttribute('aria-label','Change modified time');
 dialog.innerHTML=`<h2>Change modified time</h2><p id="folderModifiedSummary"></p><ul id="folderModifiedEntries"></ul><p>Folders apply to the folder entry only. The time below uses your local time zone.</p><form id="folderModifiedForm"><label class="editor-settings-field">Modified time<input id="folderModifiedValue" type="datetime-local" step="0.001" min="0001-01-01T00:00" max="9999-12-31T23:59:59.999" required></label><button id="folderModifiedNow" class="button" type="button">Use current time</button><p id="folderModifiedError" role="alert"></p><div class="dialog-actions"><button id="folderModifiedCancel" class="button" type="button">Cancel</button><button id="folderModifiedApply" class="button primary" type="submit">Apply modified time</button></div></form>`;
 document.body.append(dialog);const $=id=>dialog.querySelector('#'+id);let applying=false,finish=null,apply=null;
 function close(result){dialog.close();const resolve=finish;finish=null;apply=null;resolve?.(result);}
 $('folderModifiedCancel').onclick=()=>{if(!applying)close(null);};
 dialog.addEventListener('cancel',event=>{event.preventDefault();if(!applying)close(null);});
 $('folderModifiedNow').onclick=()=>{$('folderModifiedValue').value=localDateValue(Date.now());};
 $('folderModifiedForm').onsubmit=async event=>{
  event.preventDefault();if(applying||!apply)return;
  $('folderModifiedError').textContent='';
  try{
   const timestamp=parseLocalDate($('folderModifiedValue').value);applying=true;
   for(const id of ['folderModifiedValue','folderModifiedNow','folderModifiedCancel','folderModifiedApply'])$(id).disabled=true;
   const result=await apply(timestamp);close(result);
  }catch(error){$('folderModifiedError').textContent=error.message;}
  finally{applying=false;for(const id of ['folderModifiedValue','folderModifiedNow','folderModifiedCancel','folderModifiedApply'])$(id).disabled=false;}
 };
 return{open({side,entries,onApply}){
  if(dialog.open)throw Error('Finish the current modified-time change first.');
  $('folderModifiedSummary').textContent=`Apply one modified time to ${entries.length} selected ${entries.length===1?'entry':'entries'} on the ${side==='a'?'left':'right'}:`;
  const list=$('folderModifiedEntries');list.replaceChildren();for(const entry of entries){const item=document.createElement('li');item.textContent=entry.path;list.append(item);}
  const initial=entries[0]?.modified;$('folderModifiedValue').value=localDateValue(Number.isFinite(initial)?initial:Date.now());$('folderModifiedError').textContent='';
  apply=onApply;return new Promise(resolve=>{finish=resolve;dialog.showModal();$('folderModifiedValue').focus();});
 }};
}
