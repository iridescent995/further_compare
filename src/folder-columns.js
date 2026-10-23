const KEY='further-compare.folder-columns.v1';
export function createFolderColumns(host){
 const headers=[...host.querySelectorAll('.folder-columns')];let preferences={},drag=null;const controls=[];
 const valid=value=>{const result={};for(const [key,min,max]of [['size',48,240],['modified',80,320]])if(Number.isFinite(value?.[key])&&value[key]>=min&&value[key]<=max)result[key]=Math.round(value[key]);return result;};
 try{preferences=valid(JSON.parse(localStorage.getItem(KEY)));}catch{}
 const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(preferences));}catch{}};
 function widths(){const width=headers[0]?.clientWidth||500,small=innerWidth<=900,size=Math.min(preferences.size??(small?60:78),Math.max(48,Math.min(240,width-180))),modified=Math.min(preferences.modified??(small?115:155),Math.max(80,Math.min(320,width-size-100)));return {size,modified,width};}
 function apply(){const current=widths();host.style.setProperty('--folder-size-width',current.size+'px');host.style.setProperty('--folder-modified-width',current.modified+'px');for(const {handle,key}of controls){handle.setAttribute('aria-valuenow',String(Math.round(current[key])));handle.setAttribute('aria-valuemin',String(key==='size'?48:80));handle.setAttribute('aria-valuemax',String(Math.round(key==='size'?Math.max(48,Math.min(240,current.width-180)):Math.max(80,Math.min(320,current.width-current.size-100)))));}}
 function change(key,value){preferences={...preferences,[key]:Math.round(Math.max(key==='size'?48:80,Math.min(key==='size'?240:320,value)))};apply();}
 function finish(cancel=false){if(!drag)return;const old=drag;drag=null;if(cancel){preferences=old.before;apply();}else save();if(old.handle.hasPointerCapture(old.pointer))old.handle.releasePointerCapture(old.pointer);}
 for(const [index,header]of headers.entries())for(const key of ['size','modified']){
  const handle=document.createElement('span');handle.className='folder-column-resizer '+key;handle.tabIndex=0;handle.setAttribute('role','slider');handle.setAttribute('aria-orientation','horizontal');handle.setAttribute('aria-label',`${index?'Right':'Left'} ${key==='size'?'size':'last modified'} column width`);handle.title='Drag to resize both panes · Arrow keys adjust · Double-click or Home resets';
  handle.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();finish(true);handle.focus();drag={handle,key,pointer:event.pointerId,start:event.clientX,width:widths()[key],before:{...preferences}};handle.setPointerCapture(event.pointerId);};
  handle.onpointermove=event=>{if(drag?.handle===handle&&drag.pointer===event.pointerId)change(key,drag.width-(event.clientX-drag.start));};
  handle.onpointerup=()=>finish();handle.onpointercancel=()=>finish(true);handle.onlostpointercapture=()=>finish(true);
  handle.ondblclick=event=>{event.preventDefault();delete preferences[key];apply();save();};
  handle.onkeydown=event=>{if(event.key==='Escape'&&drag){event.preventDefault();finish(true);return;}if(!['ArrowLeft','ArrowRight','Home'].includes(event.key))return;event.preventDefault();event.stopPropagation();if(drag)return;if(event.key==='Home')delete preferences[key];else change(key,widths()[key]+(event.key==='ArrowRight'?1:-1)*(event.shiftKey?20:5));apply();save();};
  header.append(handle);controls.push({handle,key});
 }
 const observer=new ResizeObserver(apply);for(const header of headers)observer.observe(header);apply();
 return {getPreferences(){return {...preferences};},setPreferences(value,persist=true){const next=valid(value);if(persist)localStorage.setItem(KEY,JSON.stringify(next));finish(true);preferences=next;apply();},reset(){finish(true);preferences={};apply();save();},destroy(){finish(true);observer.disconnect();for(const {handle}of controls)handle.remove();}};
}
