export function createFolderOperationHistory({download,desktop=null}){
 const dialog=document.createElement('dialog');dialog.id='folderOperationHistory';dialog.className='operation-history';dialog.setAttribute('aria-label','File action history');dialog.style.cssText='border:0;border-radius:16px';
 dialog.innerHTML='<h2>File action history</h2><p>Copy, move, delete, rename, creation, timestamp, merge and sync attempts. Keeps the latest 100 attempts and up to 100 planned paths per attempt. History stays in this window unless retention is enabled. Saved history includes file paths and backup locations.</p><label data-retention><input type="checkbox" data-persist> Keep history between app runs</label><p data-storage role="status"></p><p data-empty>No file actions recorded.</p><ol data-entries></ol><div class="dialog-actions"><button class="button" data-export>Export JSON…</button><button class="button" data-clear>Clear history</button><button class="button" data-close>Close</button></div>';
 document.body.append(dialog);const entries=[];let previous=null,enabled=false,busy=0,queue=Promise.resolve();const persistence=!!desktop?.getFileActionHistory;dialog.querySelector('[data-retention]').hidden=!persistence;const pendingEntries=new Map();
 const clean=value=>String(value??'').slice(0,8192);
 const newId=()=>{if(crypto.randomUUID)return crypto.randomUUID();const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=[...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');};
 const node=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
 function merge(values){const unique=new Map();for(const entry of values)unique.set(entry.id,entry);entries.splice(0,entries.length,...[...unique.values()].sort((a,b)=>Date.parse(b.time)-Date.parse(a.time)).slice(0,100));}
 // Keep locally recorded attempts visible while an earlier native request is pending.
 function adopt(state,keepLocal=false){enabled=state.enabled;dialog.querySelector('[data-persist]').checked=enabled;if(enabled)merge([...state.entries,...(keepLocal?entries:pendingEntries.values())]);}
 function enqueue(action){busy++;render();const next=queue.then(action);queue=next.catch(error=>{dialog.querySelector('[data-storage]').textContent='History could not be saved or loaded: '+(error.message||error);}).finally(()=>{busy--;render();});return queue;}
 function outcomeDescription(captured,outcome){
  if(!outcome?.remoteTransfer||!Array.isArray(outcome.items))return captured.description;
  let description=clean(captured.description).slice(0,4096)+(outcome.manifestPath?'\nRecovery record: '+clean(outcome.manifestPath):'')+(outcome.recoveryWarning?'\n'+clean(outcome.recoveryWarning):'')+'\n\nTransfer results:';
  for(const item of outcome.items.slice(0,100)){
   const action={'create-directory':'Create folder','finalize-directory':'Set folder metadata'}[item.action];
   const location=item.action==='delete'?'Delete file · '+clean(item.sourcePath||item.source||item.path):action?action+' · '+clean(item.target):(item.action==='rename'?'Rename file · ':'')+clean(item.source)+' → '+clean(item.target);
   const line='\n'+clean(item.status||'unattempted')+' · '+location+(item.published&&item.status!=='completed'?' · published; verification incomplete':'')+(item.renamed===null?' · rename outcome unknown':item.renamed===true&&item.status!=='completed'?' · rename acknowledged; verification incomplete':'')+(item.deleted===null?' · deletion outcome unknown':item.deleted===true&&item.status!=='completed'?' · deleted; verification incomplete':'')+(item.created===null?' · folder creation outcome unknown':'')+(item.metadataMayHaveChanged&&item.status!=='completed'?' · folder metadata may have changed':'')+(item.metadataWarning?' · '+clean(item.metadataWarning):'')+(item.error?' · '+clean(item.error):'')+(item.cleanupWarning?' · Cleanup: '+clean(item.cleanupWarning):'');
   const remaining=8192-description.length;if(remaining<=0)break;description+=line.slice(0,remaining);
  }
  if(outcome.items.length>100&&description.length<8192)description+='\nAdditional operation results omitted.'.slice(0,8192-description.length);
  return description;
 }
 function render(){
  dialog.querySelector('[data-empty]').hidden=entries.length>0;
  for(const selector of ['[data-export]','[data-clear]'])dialog.querySelector(selector).disabled=!entries.length||busy>0;
  dialog.querySelector('[data-persist]').disabled=busy>0;
  const list=dialog.querySelector('[data-entries]');list.replaceChildren();
  for(const entry of entries){const item=node('li','');item.dataset.status=entry.status;
   item.append(node('strong',entry.status+' · '+entry.session),node('p',new Date(entry.time).toLocaleString()),node('pre',entry.description));
   if(entry.completed!==null)item.append(node('p',entry.completed+(entry.completed===1?' operation completed.':' operations completed.')));
   if(entry.backupPath)item.append(node('p','Backup: '+entry.backupPath));
   if(entry.cleanupWarning)item.append(node('p','Cleanup warning: '+entry.cleanupWarning+' File changes completed; do not repeat the operation to retry cleanup.'));
   if(entry.error)item.append(node('p',entry.error+' Check the files and any backup before retrying.'));
   const detail=document.createElement('details');detail.append(node('summary',entry.total+(entry.total===1?' planned operation':' planned operations')),node('pre',entry.paths.join('\n')+(entry.total>entry.paths.length?'\n… Remaining paths omitted.':'')));item.append(detail);list.append(item);
  }
 }
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 dialog.querySelector('[data-clear]').onclick=()=>{if(!persistence){entries.length=0;render();return;}enqueue(async()=>{const state=await desktop.clearFileActionHistory();entries.length=0;pendingEntries.clear();adopt(state);dialog.querySelector('[data-storage]').textContent='History cleared.';});};
 dialog.querySelector('[data-persist]').onchange=()=>{const value=dialog.querySelector('[data-persist]').checked;enqueue(async()=>{try{const state=await desktop.setFileActionHistoryEnabled(value,value?[...entries]:[]);adopt(state);dialog.querySelector('[data-storage]').textContent=value?'History is saved on this computer.':'Saved history removed. Current entries remain until this app window closes.';}finally{dialog.querySelector('[data-persist]').checked=enabled;}});};
 if(persistence)enqueue(async()=>adopt(await desktop.getFileActionHistory(),true));
 dialog.querySelector('[data-export]').onclick=()=>download(JSON.stringify({version:1,entries},null,2),'further-file-action-history.json','application/json');
 dialog.addEventListener('close',()=>previous?.isConnected&&previous.focus());
 return {
  capture(session,description,plan){const paths=[];let remaining=32768;for(const op of plan.operations.slice(0,100)){const text=clean((op.sourceSide?(['delete','rename'].includes(op.action)?(op.sourceSide==='a'?'Left':'Right'):(op.sourceSide==='a'?'Left → Right':'Right → Left'))+' · ':'')+op.action+'  '+(op.sourcePath&&op.targetPath?op.sourcePath+' → '+op.targetPath:op.targetPath||op.sourcePath||op.path||''));if(text.length>remaining)break;paths.push(text);remaining-=text.length;}return {session:clean(session),description:clean(description),total:plan.operations.length,paths};},
  record(captured,outcome,error){const failure=error||outcome?.error;const entry={...captured,description:outcomeDescription(captured,outcome),id:newId(),time:new Date().toISOString(),status:outcome?.cancelled?'Cancelled':failure||outcome?.failed?'Failed':'Completed',completed:Number.isSafeInteger(outcome?.completed)&&outcome.completed>=0?outcome.completed:null,backupPath:clean(outcome?.backupPath),cleanupWarning:clean(outcome?.cleanupWarning),error:failure?clean(failure.message||failure).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''):''};entries.unshift(entry);entries.length=Math.min(entries.length,100);if(persistence){pendingEntries.set(entry.id,entry);while(pendingEntries.size>100)pendingEntries.delete(pendingEntries.keys().next().value);enqueue(async()=>{const state=await desktop.appendFileActionHistory(entry);pendingEntries.delete(entry.id);adopt(state);});}if(dialog.open)render();},
  open(){previous=document.activeElement;render();dialog.showModal();dialog.querySelector('[data-close]').focus();if(persistence)enqueue(async()=>{const state=await desktop.getFileActionHistory();if(enabled&&!state.enabled){enabled=false;dialog.querySelector('[data-persist]').checked=false;}else adopt(state);});}
 };
}
