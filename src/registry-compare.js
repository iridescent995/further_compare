import {createContextMenu} from './context-menu.js';
import registry from './registry.cjs';
const {parseRegistry,compareRegistry,serializeRegistry,encodeRegistry}=registry;
const decode=data=>Uint8Array.from(atob(data),c=>c.charCodeAt(0));
const encode=bytes=>{let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(out);};
export function createRegistryCompare({host,desktop,notify,onDirty=()=>{},onInputReplaced=()=>{},renderToolbarActions=()=>[]}){
 let state,generation=0,revision=0,resultRevision=0,rows=[],selected=null,page=0;const requests={a:0,b:0},pending={a:false,b:false};
 const archiveBindings=new WeakMap();
 const context=createContextMenu('registryContext','Registry entry actions');host.tabIndex=0;
 const busy=()=>pending.a||pending.b;
 const invoke=fn=>{try{Promise.resolve(fn()).catch(e=>notify(e.message,true));}catch(e){notify(e.message,true);}};
 const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
 const button=(label,fn,disabled=false)=>{const node=el('button',label);node.type='button';node.disabled=disabled;node.onclick=()=>invoke(fn);return node;};
 const model=side=>state.inputs[side]?parseRegistry(decode(state.inputs[side].data)):{keys:[]};
 function reset(){closeContext();generation++;pending.a=pending.b=false;state={inputs:{a:null,b:null,base:null},options:{filter:'all',resultText:null}};selected=null;page=0;render();}
 async function openSide(side){
  if(!['a','b'].includes(side))throw Error('Invalid side.');const requested=generation,ticket=++requests[side];const current=()=>requested===generation&&ticket===requests[side];let data;pending[side]=true;render();
  try{
   if(desktop){const loaded=await desktop.openData(side,'registry');if(!loaded||loaded.cancelled||!current())return;data={name:loaded.name,data:loaded.data,...(loaded.diskToken?{diskToken:loaded.diskToken}:{})};}
   else{const file=await new Promise(resolve=>{const input=el('input');input.type='file';input.accept='.reg';input.onchange=()=>resolve(input.files[0]);input.oncancel=()=>resolve(null);input.click();});if(!file||!current())return;if(file.size>10*1024*1024)throw Error('Choose a registry file below 10 MB.');data={name:file.name,data:encode(new Uint8Array(await file.arrayBuffer()))};}
   if(!current())return;parseRegistry(decode(data.data));state.inputs[side]=data;state.options.resultText=null;resultRevision++;selected=null;page=0;onInputReplaced(side);onDirty();
  }catch(error){if(current())throw error;}
  finally{if(current()){pending[side]=false;render();}}
 }
 function resultData(){if(busy())throw Error('Wait for registry loading to finish.');if(typeof state.options.resultText!=='string')throw Error('Choose or edit a result first.');const bytes=encodeRegistry(parseRegistry(state.options.resultText));parseRegistry(bytes);return encode(bytes);}
 function canApplyArchiveResult(side){return ['a','b'].includes(side)&&!busy()&&/\.reg$/i.test(state.inputs[side]?.name||'')&&typeof state.options.resultText==='string';}
 function getArchiveResult(side){if(!['a','b'].includes(side)||!state.inputs[side]||!/\.reg$/i.test(state.inputs[side].name||''))throw Error('Open a registry archive entry on this side first.');const data=resultData(),binding=Object.freeze({}),original=state,epoch=generation,edit=resultRevision,a=requests.a,b=requests.b;archiveBindings.set(binding,()=>!busy()&&state===original&&generation===epoch&&resultRevision===edit&&requests.a===a&&requests.b===b);return {data,name:'registry-result.reg',binding};}
 function isArchiveResultCurrent(binding){return !!binding&&typeof binding==='object'&&archiveBindings.get(binding)?.()===true;}
 async function saveResult(){const data=resultData();if(desktop)await desktop.saveData(data,'registry-result.reg');else{const url=URL.createObjectURL(new Blob([decode(data)]));const link=el('a');link.href=url;link.download='registry-result.reg';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}
 function copy(side){if(busy())throw Error('Wait for registry loading to finish.');if(!selected)throw Error('Select a key or value first.');const source=model(side),result=state.options.resultText===null?model('b'):parseRegistry(state.options.resultText),row=rows.find(r=>r.id===selected);if(!row)return;const key=source.keys.find(k=>k.id===row.key),index=result.keys.findIndex(k=>k.id===row.key);
  if(row.kind==='key'){if(index>=0)result.keys.splice(index,1);if(key)result.keys.push(structuredClone(key));}
  else{let target=index>=0?result.keys[index]:null;const value=key?.values.find(v=>v.id===row.left?.id||v.id===row.right?.id);if(value){if(!target){target={name:key.name,id:key.id,deleted:false,values:[]};result.keys.push(target);}if(target.deleted)throw Error('Result key is deleted. Copy the full source key first.');target.values=target.values.filter(v=>v.id!==value.id);target.values.push(structuredClone(value));}else if(target){const id=row.left?.id??row.right?.id;target.values=target.values.filter(v=>v.id!==id);}}
  state.options.resultText=serializeRegistry(result);resultRevision++;onDirty();render();
 }
 function closeContext(){revision++;context.close();}
 function initialize(side){if(busy()||!state.inputs[side])throw Error('Open a registry file first.');state.options.resultText=serializeRegistry(model(side));resultRevision++;onDirty();render();}
 function changeFilter(value){state.options.filter=value;page=0;selected=null;onDirty();render();}
 function visibleRows(){return rows.filter(row=>state.options.filter==='all'||(state.options.filter==='equal'?row.status==='equal':row.status!=='equal'));}
 function pageCount(){return Math.max(1,Math.ceil(visibleRows().length/300));}
 function canCopy(){return !busy()&&rows.some(row=>row.id===selected);}
 function restoreRow(id){const row=[...host.querySelectorAll('.registry-row')].find(node=>node.dataset.registryId===id);(row||host).focus({preventScroll:true});}
 function openContext(event,keyboard=false){
  if(event.target.isContentEditable||event.target.closest('input,textarea,select'))return;
  event.preventDefault();event.stopPropagation();const row=event.target.closest('.registry-row'),id=row?.dataset.registryId;
  if(id&&id!==selected){selected=id;render();}else closeContext();
  const restore=id?null:(host.contains(document.activeElement)?document.activeElement:host),selection=selected,ticket=revision,currentState=state,epoch=generation;
  const valid=()=>revision===ticket&&generation===epoch&&state===currentState&&selected===selection&&host.isConnected&&!host.closest('[hidden]')&&document.getElementById('registryContext')?.hidden===false;
  const item=(label,fn,disabled=()=>false)=>({label,disabled:disabled(),validate:()=>valid()&&!disabled(),action:()=>invoke(fn)});
  const archiveActions=[...host.querySelectorAll('.registry-toolbar [data-registry-extra-action]')].filter(node=>node.tagName==='BUTTON').map(node=>item(node.textContent.trim(),()=>node.click(),()=>node.disabled||!node.isConnected));
  const entries=[item('Open left registry file',()=>openSide('a')),item('Open right registry file',()=>openSide('b')),item('Export registry result',saveResult,()=>busy()||state.options.resultText===null),...archiveActions,{separator:true},
   item('Copy left value to result',()=>copy('a'),()=>!canCopy()),item('Copy right value to result',()=>copy('b'),()=>!canCopy()),
   item('Initialize result from left',()=>initialize('a'),()=>busy()||!state.inputs.a),item('Initialize result from right',()=>initialize('b'),()=>busy()||!state.inputs.b),{separator:true},
   item('Show differences',()=>changeFilter('changed')),item('Show matching entries',()=>changeFilter('equal')),item('Show all entries',()=>changeFilter('all')),{separator:true},
   item('Previous entries',()=>{page--;selected=null;render();},()=>page===0),item('Next entries',()=>{page++;selected=null;render();},()=>page>=pageCount()-1)];
  const origin=id?[...host.querySelectorAll('.registry-row')].find(node=>node.dataset.registryId===id):(restore||host),rect=origin.getBoundingClientRect();
  context.open(entries,keyboard?rect.left+12:event.clientX,keyboard?rect.top+Math.min(rect.height,28):event.clientY,()=>{if(!host.isConnected||host.closest('[hidden]'))return;if(id)restoreRow(id);else if(restore?.isConnected)restore.focus({preventScroll:true});else host.focus({preventScroll:true});});
 }
 host.addEventListener('contextmenu',event=>openContext(event));
 host.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')openContext(event,true);});
 function refreshActions(){const toolbar=host.querySelector('.registry-toolbar');if(!toolbar)return;for(const action of toolbar.querySelectorAll('[data-registry-extra-action]'))action.remove();for(const action of renderToolbarActions('registry-compare')||[]){action.dataset.registryExtraAction='';toolbar.append(action);}}
 function render(){const active=document.activeElement,hadFocus=host.contains(active),editing=active?.tagName==='TEXTAREA',selectionStart=editing?active.selectionStart:null,selectionEnd=editing?active.selectionEnd:null;closeContext();host.setAttribute('aria-busy',String(busy()));host.replaceChildren();host.classList.add('registry-compare');const toolbar=el('div',undefined,'registry-toolbar');toolbar.append(button('Open left registry file',()=>openSide('a')),el('span',state.inputs.a?.name||'No left file'),button('Open right registry file',()=>openSide('b')),el('span',state.inputs.b?.name||'No right file'),button('Export result .reg',saveResult,busy()||state.options.resultText===null));host.append(toolbar,el('p','Compare registry files locally. Export creates a file; nothing is applied to the operating system. UTF-8 and UTF-16LE, up to 10 MB.','registry-note'));refreshActions();
  try{rows=compareRegistry(model('a'),model('b'));}catch(error){host.append(el('p',error.message,'registry-error'));if(hadFocus)host.focus({preventScroll:true});return;}
  const controls=el('div',undefined,'registry-toolbar'),label=el('label','Show '),filter=el('select');filter.setAttribute('aria-label','Registry filter');for(const [value,text]of [['all','All entries'],['changed','Differences'],['equal','Matching']]){const option=el('option',text);option.value=value;filter.append(option);}filter.value=state.options.filter;filter.onchange=()=>changeFilter(filter.value);label.append(filter);controls.append(label);
  for(const [side,text]of [['a','Use left as result'],['b','Use right as result']])controls.append(button(text,()=>initialize(side),busy()||!state.inputs[side]));controls.append(button('Copy selected left to result',()=>copy('a'),!canCopy()),button('Copy selected right to result',()=>copy('b'),!canCopy()));host.append(controls);
  const visible=rows.filter(row=>state.options.filter==='all'||(state.options.filter==='equal'?row.status==='equal':row.status!=='equal')),pages=Math.max(1,Math.ceil(visible.length/300));page=Math.min(page,pages-1);const nav=el('div',undefined,'registry-toolbar');nav.append(button('Previous entries',()=>{page=Math.max(0,page-1);selected=null;render();},page===0),el('span',`${rows.length} entries · ${rows.filter(r=>r.status!=='equal').length} different · Page ${page+1} / ${pages}`),button('Next entries',()=>{page=Math.min(pages-1,page+1);selected=null;render();},page>=pages-1));host.append(nav);
  const list=el('div',undefined,'registry-list');list.setAttribute('role','listbox');list.setAttribute('aria-label','Registry entries');for(const row of visible.slice(page*300,(page+1)*300)){const node=el('button',undefined,'registry-row '+row.kind+' '+row.status+(selected===row.id?' selected':''));node.type='button';node.setAttribute('role','option');node.setAttribute('aria-selected',String(selected===row.id));node.title=row.kind==='key'?row.name:row.key+' \\ '+row.name;node.append(el('span',row.kind==='key'?row.name:row.name||'(Default)'),el('span',row.kind==='key'?((row.left?.deleted||row.right?.deleted)?'Key deletion':'Key'):(row.left?.type||'—')+' / '+(row.right?.type||'—')),el('span',row.status));node.dataset.registryId=row.id;node.onclick=()=>{selected=row.id;render();restoreRow(row.id);};list.append(node);}host.append(list);
  const current=rows.find(row=>row.id===selected);if(current){host.append(el('h3',current.kind==='value'?current.key+' \\ '+current.name:current.name));const details=el('div',undefined,'registry-details');for(const [key,label]of [['left','Left'],['right','Right']]){const pane=el('section');pane.append(el('strong',label),el('pre',current[key]?JSON.stringify(current[key],null,2):'Not present'));details.append(pane);}host.append(details);}
  if(state.options.resultText!==null){const label=el('label','Result registry text — editable'),area=el('textarea');area.setAttribute('aria-label','Result registry text');area.value=state.options.resultText;area.spellcheck=false;area.oninput=()=>{closeContext();state.options.resultText=area.value;resultRevision++;onDirty();refreshActions();};label.append(area);host.append(label,el('p','The result is validated before exporting as UTF-16LE with a BOM. Typed byte values remain byte values.','registry-note'));}
  if(hadFocus){const editor=editing?host.querySelector('textarea'):null;if(editor){editor.focus({preventScroll:true});editor.setSelectionRange(selectionStart,selectionEnd);}else restoreRow(selected);}
 }
 reset();return {setState(value){closeContext();generation++;pending.a=pending.b=false;state={inputs:{a:null,b:null,base:null,...structuredClone(value?.inputs||{})},options:{filter:'all',resultText:null,...structuredClone(value?.options||{})}};if(!['all','changed','equal'].includes(state.options.filter))state.options.filter='all';selected=null;page=0;render();},getState(){return structuredClone(state);},openSide,saveResult,getArchiveResult,isArchiveResultCurrent,canApplyArchiveResult,refreshActions,reset};
}
