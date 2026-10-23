/** A single context-menu tree with independent, viewport-constrained panels. */
export function createContextMenu(id,label='Folder actions'){
 const root=document.createElement('div');root.id=id;root.hidden=true;document.body.append(root);
 let panels=[],restoreFocus=null,sequence=0;
 document.addEventListener('pointerdown',event=>{if(!root.hidden&&!root.contains(event.target))close();});
 window.addEventListener('resize',()=>close());
 const items=panel=>[...panel.children].filter(el=>el.matches('button:not(:disabled)'));
 function focus(item){if(!item)return;for(const button of items(item.parentElement))button.tabIndex=-1;item.tabIndex=0;item.focus({preventScroll:true});item.scrollIntoView({block:'nearest'});}
 function trim(depth){while(panels.length>depth){const panel=panels.pop();panel.owner?.setAttribute('aria-expanded','false');panel.owner?.removeAttribute('aria-controls');panel.remove();}}
 function close(restore=false){root.hidden=true;trim(0);if(restore)restoreFocus?.();}
 function position(panel,x,y){const rect=panel.getBoundingClientRect();panel.style.left=Math.max(4,Math.min(x,innerWidth-rect.width-4))+'px';panel.style.top=Math.max(4,Math.min(y,innerHeight-rect.height-4))+'px';}
 function openChild(button,entries,keyboard=false){
  const depth=panels.indexOf(button.parentElement)+1;
  if(panels[depth]?.owner===button){if(keyboard){const first=items(panels[depth])[0];if(first)focus(first);else panels[depth].focus({preventScroll:true});}return;}
  trim(depth);const panel=makePanel(entries,button);button.setAttribute('aria-expanded','true');
  const anchor=button.getBoundingClientRect(),width=panel.getBoundingClientRect().width;
  position(panel,anchor.right+width+2>innerWidth-4?anchor.left-width+2:anchor.right-2,anchor.top-4);
  if(keyboard){const first=items(panel)[0];if(first)focus(first);else panel.focus({preventScroll:true});}
 }
 function makePanel(entries,owner=null){
  const panel=document.createElement('div');panel.className='folder-context-panel';panel.role='menu';panel.tabIndex=-1;panel.owner=owner;
  panel.setAttribute('aria-label',owner?.textContent||label);if(owner){panel.id=id+'-panel-'+(++sequence);panel.setAttribute('aria-labelledby',owner.id);owner.setAttribute('aria-controls',panel.id);}root.append(panel);panels.push(panel);
  for(const entry of entries){
   if(entry.separator){const hr=document.createElement('hr');hr.role='separator';panel.append(hr);continue;}
   const button=document.createElement('button');button.type='button';button.role='menuitem';button.textContent=entry.label;button.title=entry.title||entry.label;button.disabled=Boolean(entry.disabled);button.tabIndex=-1;panel.append(button);
   if(entry.children){button.setAttribute('aria-label',entry.label);button.id=id+'-group-'+(++sequence);button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');}
   button.onpointerenter=()=>{if(button.disabled){trim(panels.indexOf(panel)+1);return;}focus(button);if(entry.children)openChild(button,entry.children);else trim(panels.indexOf(panel)+1);};
   button.onclick=()=>{if(entry.children)openChild(button,entry.children,true);else{const valid=entry.validate?entry.validate():true;close(true);if(valid)entry.action();}};
   button.onkeydown=event=>{if(event.key==='ArrowRight'&&entry.children){event.preventDefault();event.stopPropagation();openChild(button,entry.children,true);}};
  }
  panel.onscroll=()=>{
   const depth=panels.indexOf(panel)+1,child=panels[depth];if(!child)return;
   const anchor=child.owner.getBoundingClientRect(),bounds=panel.getBoundingClientRect(),width=child.getBoundingClientRect().width;
   if(anchor.top<bounds.top||anchor.bottom>bounds.bottom){trim(depth);return;}
   position(child,anchor.right+width+2>innerWidth-4?anchor.left-width+2:anchor.right-2,anchor.top-4);
  };
  let typed='',typedAt=0;
  panel.onkeydown=event=>{
   const enabled=items(panel),index=enabled.indexOf(document.activeElement);let target;
   if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
    typed='';trim(panels.indexOf(panel)+1);target=event.key==='Home'?enabled[0]:event.key==='End'?enabled.at(-1):enabled[(index+(event.key==='ArrowDown'?1:-1)+enabled.length)%enabled.length];focus(target);
   }else if(event.key==='ArrowLeft'||event.key==='Escape'){
    typed='';if(owner){trim(panels.indexOf(panel));focus(owner);}else if(event.key==='Escape')close(true);
   }else if(event.key==='Tab'){close(true);return;}
   else if(event.key.length===1&&(event.key!==' '||(typed&&performance.now()-typedAt<=800))&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.isComposing){
    const now=performance.now(),character=event.key.toLocaleLowerCase();typed=now-typedAt>800?character:typed+character;typedAt=now;
    const repeated=[...typed].every(value=>value===character),prefix=repeated?character:typed;
    const start=repeated?index+1:Math.max(index,0);
    const ordered=enabled.map((_,offset)=>enabled[(start+offset)%enabled.length]);
    const match=ordered.find(button=>button.textContent.trim().toLocaleLowerCase().startsWith(prefix));
    if(match){trim(panels.indexOf(panel)+1);focus(match);}
   }else return;
   event.preventDefault();event.stopPropagation();
  };
  return panel;
 }
 return {close,open(entries,x,y,onRestore){close();restoreFocus=onRestore;root.hidden=false;const panel=makePanel(entries);position(panel,x,y);focus(items(panel)[0]);}};
}
