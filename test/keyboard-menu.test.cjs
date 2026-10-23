'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {TYPES}=require('../desktop/sessions.cjs');
const {FOLDER_FILTERS}=require('../desktop/folder-display.cjs');
const {validateShortcuts,normalizeAccelerator}=require('../desktop/keyboard-shortcuts.cjs');
const source=fs.readFileSync(require.resolve('../desktop/main.cjs'),'utf8'),start=source.indexOf('function buildApplicationMenu(){'),end=source.indexOf('\nif (primaryInstance)',start);
function menu(platform,overrides={}){let template;const actions=[],context={process:{platform},TYPES,FOLDER_FILTERS,shortcutOverrides:overrides,shortcutCatalog:null,createWindow(){actions.push('new-window');},focusedRuntime:()=>({window:{webContents:{send:(channel,id)=>actions.push([channel,id])}}}),Menu:{buildFromTemplate:value=>value,setApplicationMenu:value=>{template=value;}}};vm.createContext(context);vm.runInContext(source.slice(start,end)+'\nbuildApplicationMenu();',context);const flatten=entries=>entries.flatMap(entry=>[entry,...(Array.isArray(entry.submenu)?flatten(entry.submenu):[])]);return {items:flatten(template),catalog:JSON.parse(JSON.stringify(context.shortcutCatalog)),actions};}
for(const platform of ['darwin','win32','linux']){
 test(platform+' menu defaults have no effective accelerator conflicts and reserve standard history',()=>{
  const m=menu(platform);assert.doesNotThrow(()=>validateShortcuts({},m.catalog,platform));const used=new Map();
  for(const item of m.items){if(!item.accelerator)continue;const key=normalizeAccelerator(item.accelerator,platform).replace('CmdOrCtrl',platform==='darwin'?'Command':'Ctrl');assert.ok(!used.has(key),'Duplicate '+key+' for '+item.id+' and '+used.get(key));used.set(key,item.id);}
  assert.equal(m.items.find(item=>item.id==='edit:undo').accelerator,'CmdOrCtrl+Z');assert.equal(m.items.find(item=>item.id==='edit:redo').accelerator,'CmdOrCtrl+Shift+Z');assert.equal(m.items.some(item=>item.role==='undo'||item.role==='redo'),false);assert.equal(m.catalog.some(item=>item.id.startsWith('edit:')),false);
  for(const action of ['edit:undo','edit:redo']){m.items.find(item=>item.id===action).click();assert.deepEqual(m.actions.at(-1),['menu-action',action]);}
  if(platform!=='darwin'){const alias=m.items.find(item=>item.id==='edit:redo-alternate');assert.equal(alias.accelerator,'Ctrl+Y');assert.equal(alias.acceleratorWorksWhenHidden,true);alias.click();assert.deepEqual(m.actions.at(-1),['menu-action','edit:redo']);}
 });
 test(platform+' customization still dispatches exactly one accelerator per repeated command',()=>{const m=menu(platform,{'copy-right':'CmdOrCtrl+Alt+K',undo:'',redo:''});const copies=m.items.filter(item=>item.id==='copy-right');assert.ok(copies.length>1);assert.equal(copies.filter(item=>item.accelerator).length,1);assert.equal(m.items.find(item=>item.id==='undo').accelerator,undefined);assert.equal(m.items.find(item=>item.id==='edit:undo').accelerator,'CmdOrCtrl+Z');assert.throws(()=>validateShortcuts({'copy-right':'CmdOrCtrl+Z'},m.catalog,platform),/reserved/);});
}
test('native history menu actions cross the preload allowlist on every platform',()=>{
 const {EventEmitter}=require('node:events'),preload=fs.readFileSync(require.resolve('../desktop/preload.cjs'),'utf8');
 for(const platform of ['darwin','win32','linux']){
  const ipcRenderer=new EventEmitter(),received=[];let desktop;
  vm.runInNewContext(preload,{process:{platform},require:id=>{assert.equal(id,'electron');return {contextBridge:{exposeInMainWorld:(name,value)=>{assert.equal(name,'desktop');desktop=value;}},ipcRenderer,webUtils:{}};}});
  const unsubscribe=desktop.onMenuAction(action=>received.push(action)),m=menu(platform);
  for(const id of ['edit:undo','edit:redo']){m.items.find(item=>item.id===id).click();const [channel,action]=m.actions.at(-1);ipcRenderer.emit(channel,{},action);}
  assert.deepEqual(received,['edit:undo','edit:redo']);
  ipcRenderer.emit('menu-action',{},'edit:untrusted');assert.equal(received.length,2);
  unsubscribe();ipcRenderer.emit('menu-action',{},'edit:undo');assert.equal(received.length,2);
 }
});
