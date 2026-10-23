export function createFolderQuickCompare(){
 const dialog=document.createElement('dialog');dialog.id='folderQuickCompare';dialog.setAttribute('aria-labelledby','folderQuickCompareTitle');
 dialog.innerHTML='<h2 id="folderQuickCompareTitle">Quick comparison</h2><p data-result role="status"></p><p data-rule></p><p data-detail></p><dl><dt>Left</dt><dd data-left></dd><dt>Right</dt><dd data-right></dd></dl><div class="dialog-actions"><button class="button" data-close>Close</button><button class="button primary" data-open>Open comparison</button></div>';
 document.body.append(dialog);let finish=null,previous=null;
 dialog.querySelector('[data-close]').onclick=()=>dialog.close('close');dialog.querySelector('[data-open]').onclick=()=>dialog.close('open');
 dialog.addEventListener('close',()=>{const resolve=finish;finish=null;if(previous?.isConnected)previous.focus();resolve?.(dialog.returnValue==='open');});
 return {open({left,right,status,rule,detail}){dialog.querySelector('[data-left]').textContent=left;dialog.querySelector('[data-right]').textContent=right;dialog.querySelector('[data-result]').textContent=status==='equal'?'Files match under the selected rules.':status==='changed'?'Files differ under the selected rules.':'Comparison could not be completed.';dialog.querySelector('[data-rule]').textContent='Comparison: '+rule;dialog.querySelector('[data-detail]').textContent=detail;previous=document.activeElement;dialog.returnValue='close';dialog.showModal();dialog.querySelector('[data-close]').focus();return new Promise(resolve=>finish=resolve);}};
}
