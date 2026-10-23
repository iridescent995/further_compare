// Move the original controls, retaining their handlers and session state.
export function createCompactFolderLayout(){
 const byId=id=>document.getElementById(id),workspace=byId('folderWorkspace'),active=byId('activeWorkspace');
 if(!workspace||!active)return {refresh(){},close(){},open(){}};
 const toolbar=workspace.querySelector('.folder-toolbar'),navigation=workspace.querySelector('.folder-navigation');
 const dialog=document.createElement('dialog');dialog.id='folderOptionsDialog';dialog.className='folder-options-dialog';dialog.setAttribute('aria-labelledby','folderOptionsTitle');
 dialog.innerHTML='<header><div><span class="options-eyebrow">YOUR WORKSPACE</span><h2 id="folderOptionsTitle">Folder filters & options</h2></div><button type="button" class="button" data-close aria-label="Close folder options">✕</button></header><p class="options-description">Tune comparison rules, arrange the tree, and review file operations. Changes apply immediately.</p><div class="folder-options-sections"></div><footer><span>Esc to close</span><button type="button" class="button primary" data-done>Done</button></footer>';
 const sections=dialog.querySelector('.folder-options-sections');
 const section=(title,description,nodes)=>{const block=document.createElement('section'),heading=document.createElement('h3'),note=document.createElement('p'),controls=document.createElement('div');heading.textContent=title;note.textContent=description;controls.className='folder-options-controls';controls.append(...nodes.filter(Boolean));block.append(heading,note,controls);sections.append(block);};
 const label=id=>byId(id)?.closest('label');
 section('Comparison rules','Choose how file differences are detected.',[workspace.querySelector('.folder-rules')]);
 section('Tree & display','Arrange loaded entries and control which folders remain visible.',[label('folderViewMode'),label('folderSort'),byId('folderSortOrder'),byId('folderViewHint'),byId('folderAlwaysShow'),byId('folderShowHidden'),label('folderAutoRefresh'),byId('folderAutoRefreshNote')]);
 section('Pairing & alignment','Compare or align one selected entry from each side.',[label('folderNameIgnoreCase'),label('folderNameNormalizeUnicode'),label('folderNameIgnoreExtension'),byId('folderNameRulesNote'),byId('comparePair'),byId('alignFolderPair'),byId('clearFolderAlignment')]);
 section('File operations','Choose the direction and contents included when reviewing changes.',[label('folderOperationScope'),byId('syncModeLabel'),byId('directionLabel')]);
 section('Find & reports','Locate entries or export the current comparison.',[byId('folderFindName'),byId('folderReport'),byId('saveSnapshotA'),byId('saveSnapshotB'),byId('compareSnapshots')]);
 document.body.append(dialog);
 const legend=workspace.querySelector('.folder-legend');if(legend)active.querySelector('.statusbar')?.append(legend);
 const button=document.createElement('button');button.id='folderOptions';button.type='button';button.className='icon-button';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',dialog.id);button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6"/></svg><span>Filters & options</span>';
 navigation.prepend(button);
 const hint=navigation.querySelector(':scope > span:last-child');if(hint&&!hint.id){hint.classList.add('folder-interaction-hint');section('Selection gestures','Use either pane to select entries.',[hint]);}
 // A single command row keeps the tree close to its paths. Move existing nodes
 // rather than cloning them, preserving handlers and native-menu targets.
 toolbar.prepend(...navigation.childNodes);navigation.remove();toolbar.classList.add('folder-command-bar');
 for(const side of ['A','B']){
  const controls=byId('folderHistory'+side)?.parentElement,copy=byId('copy'+side),remove=byId('delete'+side),header=copy?.parentElement;
  if(!controls||!copy||!remove)continue;
  const name=side==='A'?'left':'right';copy.setAttribute('aria-label','Copy selected '+name+' entries to '+(side==='A'?'right':'left'));remove.setAttribute('aria-label','Delete selected '+name+' entries');
  controls.append(copy,remove);if(header?.tagName==='HEADER')header.remove();
 }
 let returnFocus=null,restoreFocus=true;
 const close=(restore=true)=>{if(!dialog.open)return;restoreFocus=restore;dialog.close();};
 const open=()=>{if(workspace.hidden||active.hidden)return;returnFocus=document.activeElement;restoreFocus=true;dialog.showModal();dialog.querySelector('[data-close]').focus({preventScroll:true});dialog.scrollTop=0;};
 button.onclick=open;
 dialog.querySelector('[data-close]').onclick=dialog.querySelector('[data-done]').onclick=()=>close();
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('close',()=>{if(restoreFocus&&!workspace.hidden&&!active.hidden&&!document.querySelector('dialog[open]')){const target=returnFocus?.isConnected&&!returnFocus.closest('[hidden]')?returnFocus:button;target.focus({preventScroll:true});}});
 // Close before the original action runs: its own dialog must be the only modal.
 const launches=new Set(['folderTextEncoding','comparePair','alignFolderPair','clearFolderAlignment','folderFindName','folderReport','saveSnapshotA','saveSnapshotB','compareSnapshots']);
 dialog.addEventListener('click',event=>{const action=event.target.closest('button');if(action&&!action.disabled&&launches.has(action.id))close(false);},true);
 const refresh=()=>{const folder=!workspace.hidden&&!active.hidden;document.body.classList.toggle('compact-folder-mode',folder);if(!folder)close(false);};
 new MutationObserver(refresh).observe(workspace,{attributes:true,attributeFilter:['hidden']});
 new MutationObserver(refresh).observe(active,{attributes:true,attributeFilter:['hidden']});
 refresh();return {refresh,close,open};
}
