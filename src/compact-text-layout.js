// Relocate existing controls so their listeners and session state stay intact.
export function createCompactTextLayout(){
 const byId=id=>document.getElementById(id),toolbar=document.querySelector('.toolbar');
 const dialog=document.createElement('dialog');dialog.id='textOptionsDialog';dialog.className='text-options-dialog';dialog.setAttribute('aria-labelledby','textOptionsTitle');
 dialog.innerHTML='<header><div><span class="options-eyebrow">YOUR WORKSPACE</span><h2 id="textOptionsTitle">Filters & options</h2></div><button type="button" class="button" data-close aria-label="Close text options">✕</button></header><p class="options-description">Fine-tune the comparison and file formats. Changes apply immediately.</p><div class="text-options-sections"></div><footer><span>Esc to close</span><button type="button" class="button primary" data-done>Done</button></footer>';
 const sections=dialog.querySelector('.text-options-sections');
 const section=(title,description,nodes)=>{const block=document.createElement('section'),heading=document.createElement('h3'),note=document.createElement('p'),controls=document.createElement('div');heading.textContent=title;note.textContent=description;controls.className='text-options-controls';controls.append(...nodes.filter(Boolean));block.append(heading,note,controls);sections.append(block);return controls;};
 section('Comparison rules','Choose which differences matter.',[...toolbar.querySelectorAll('.text-comparison-rule')]);
 const displayOptions=section('Display filters','Focus the lines you want to review while keeping all text editable.',[]);
 const patchButton=document.createElement('button');patchButton.type='button';patchButton.className='button';patchButton.dataset.command='text:export-patch';patchButton.textContent='Export patch…';const applyButton=document.createElement('button');applyButton.type='button';applyButton.className='button';applyButton.dataset.command='text:apply-patch';applyButton.textContent='Apply patch…';section('Patches','Export changes or preview a patch against either editor.',[patchButton,applyButton]);
 section('Alignment','Pair changed Java, XML and SQL lines by lexical structure. Plain text, ambiguous syntax or work limits use ordinary pairing. Significance rules and manual anchors are retained. Show moved text links unique unchanged blocks; repeats and modified text may be omitted. Activate a move badge, right-click its line number, or focus its badge and press Enter/Space to jump. Alt+M also jumps where your keyboard produces M.',[byId('syntaxAlignmentControl'),byId('showMovedBlocksControl'),byId('alignLines')]);
 section('File formats','Control output encoding, byte order marks and line endings. Auto reads Unicode BOMs or UTF-8; choose Japanese, Chinese and Korean encodings explicitly.',[byId('textFormatTools')]);
 if(!window.desktop&&byId('shellTools')){byId('shellTools').hidden=true;byId('shellTools').classList.add('browser-shell-hidden');}
 if(window.desktop)section('File manager','Choose the left file used by Finder or Explorer comparisons.',[byId('shellTools')]);
 if(window.desktop)section('Clipboard','Start a comparison or replace either side with clipboard text.',[byId('clipboardTools')]);
 document.body.append(dialog);
 const button=document.createElement('button');button.id='textOptions';button.type='button';button.className='icon-button';button.setAttribute('aria-haspopup','dialog');button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6"/></svg><span>Filters & options</span>';
 const textTools=byId('textTools'),textMain=textTools?.querySelector('.text-tools-row:not(.text-find-row)');if(textMain){textMain.id='textToolsMain';textMain.classList.add('text-tools-inline');toolbar.append(textMain);}
 toolbar.append(button);const filters=toolbar.querySelector('.filter-group');if(filters)filters.title='Focus matching lines while keeping the complete text editable';let returnFocus;
 button.onclick=()=>{returnFocus=document.activeElement;dialog.showModal();};
 dialog.querySelector('[data-close]').onclick=dialog.querySelector('[data-done]').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{if(returnFocus?.isConnected)returnFocus.focus();});
 const filterGroup=toolbar.querySelector('.filter-group'),filterHome=document.createComment('Display filters');filterGroup.before(filterHome);
 const refresh=()=>{const text=!byId('textWorkspace').hidden&&!byId('activeWorkspace').hidden;document.body.classList.toggle('compact-text-mode',text);button.hidden=!text;if(textMain)textMain.hidden=!text||textTools.hidden;if(text){if(filterGroup.parentElement!==displayOptions)displayOptions.append(filterGroup);}else if(filterGroup.parentElement!==toolbar)filterHome.after(filterGroup);filterGroup.setAttribute('aria-label',text?'Highlight focus':'Display filter');for(const item of filterGroup.querySelectorAll('[data-filter]'))item.title=text?'Focus '+item.textContent.trim().toLowerCase()+' lines; all text stays editable':'';if(!text&&dialog.open)dialog.close();};
 if(textTools)new MutationObserver(refresh).observe(textTools,{attributes:true,attributeFilter:['hidden']});
 new MutationObserver(refresh).observe(byId('textWorkspace'),{attributes:true,attributeFilter:['hidden']});
 new MutationObserver(refresh).observe(byId('activeWorkspace'),{attributes:true,attributeFilter:['hidden']});
 refresh();return {refresh};
}
