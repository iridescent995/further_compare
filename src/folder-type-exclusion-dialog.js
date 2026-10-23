export function createFolderTypeExclusionDialog(){
 const dialog=document.createElement('dialog');dialog.id='folderTypeExclusionDialog';dialog.className='alignment-dialog';dialog.setAttribute('aria-label','Exclude file types');
 dialog.innerHTML='<h2>Exclude file types</h2><p>Hide names ending in these extensions in both panes, at any folder depth. Matching folder names and their contents are hidden too. Existing filters are kept. No files are changed.</p><div data-types class="text-options-controls"></div><p>These filters are saved with the session. Use Reset masks to remove them.</p><div class="dialog-actions"><button class="button" data-cancel>Cancel</button><button class="button primary" data-apply>Exclude types</button></div>';
 document.body.append(dialog);let resolve=null,focus=null;
 const close=value=>{const done=resolve;resolve=null;dialog.close();if(focus?.isConnected)focus.focus({preventScroll:true});done?.(value);};
 dialog.querySelector('[data-cancel]').onclick=()=>close(false);dialog.querySelector('[data-apply]').onclick=()=>close(true);dialog.addEventListener('cancel',event=>{event.preventDefault();close(false);});
 return {open(masks){if(resolve)return Promise.resolve(false);focus=document.activeElement;dialog.querySelector('[data-types]').replaceChildren(...masks.map(mask=>{const item=document.createElement('code');item.textContent=mask;return item;}));dialog.showModal();dialog.querySelector('[data-cancel]').focus();return new Promise(done=>resolve=done);}};
}
