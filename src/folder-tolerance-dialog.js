export function createFolderToleranceDialog(){
 const dialog=document.createElement('dialog');dialog.id='folderToleranceDialog';dialog.className='alignment-dialog';dialog.setAttribute('aria-label','Timestamp tolerance');
 dialog.innerHTML=`<h2>Timestamp tolerance</h2><p>Treat modified times as matching when their difference is within this many seconds. Applies to Modified Time and Size and Modified Time comparison; it does not verify file contents or change file timestamps.</p><form style="display:block"><label class="editor-settings-field">Tolerance in seconds<input name="seconds" type="number" min="0" max="86400" step="0.001" required></label><p>Use 0 for exact timestamps, up to 86400 seconds (one day). Millisecond precision is supported. This setting is saved with the session.</p><div class="dialog-actions"><button class="button" type="button" data-cancel>Cancel</button><button class="button primary" type="submit">Apply tolerance</button></div></form>`;
 document.body.append(dialog);const form=dialog.querySelector('form'),input=form.elements.namedItem('seconds');let finish=null,previousFocus=null;
 function close(value){dialog.close();const resolve=finish;finish=null;if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});resolve?.(value);}
 form.onsubmit=event=>{event.preventDefault();if(form.reportValidity())close(input.value);};
 dialog.querySelector('[data-cancel]').onclick=()=>close(null);
 dialog.addEventListener('cancel',event=>{event.preventDefault();close(null);});
 return {open(milliseconds){if(dialog.open)throw Error('Finish editing the current timestamp tolerance first.');previousFocus=document.activeElement;input.value=milliseconds/1000;return new Promise(resolve=>{finish=resolve;dialog.showModal();input.focus();input.select();});}};
}
