'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ProviderFolderService}=require('../desktop/provider-folder-service.cjs');
const {FolderAlignment}=require('../desktop/folder-alignment.cjs');
const {FilenameMatching}=require('../desktop/folder-filename-matching.cjs');
const {prepareProviderCopyInventory,revalidateProviderCopyInventory,revokeProviderCopyInventory}=require('../desktop/provider-copy-inventory.cjs');
const kinds={a:'remote',b:'remote'};
function endpoint(values){
 const data=new Map(Object.entries(values)),calls=[];let hook=()=>{};
 const metadata=p=>data.has(p)?{path:p,kind:data.get(p)===null?'directory':'file',size:data.get(p)===null?0:Buffer.byteLength(data.get(p)),identity:p,stamp:'1',mtime:1000,mtimeNs:'1000000000',strongRevision:false}:null;
 const api={rootId:'root',isIgnoredPath:()=>false,async inspectRoot(){return {path:'/root',identity:'root',stamp:'1'};},async inspectEntry(p){return metadata(p);},async *enumerateDirectory(p){calls.push('list:'+p);await hook('list',p);for(const name of [...data.keys()])if((p?name.startsWith(p+'/'):true)&&!name.slice(p?p.length+1:0).includes('/'))yield {name:name.slice(p?p.length+1:0),kind:data.get(name)===null?'directory':'file'};},async openFileReader(p){calls.push('read:'+p);await hook('read',p);const bytes=Buffer.from(data.get(p)),info=metadata(p);let offset=0;return {metadata:info,async read(n){if(offset===bytes.length)return null;const result=bytes.subarray(offset,offset+n);offset+=result.length;return result;},async validate(){return metadata(p);},async close(){}};}};
 return {api,data,calls,setHook(fn){hook=fn;}};
}
function setup(a,b){const left=endpoint(a),right=endpoint(b);return {left,right,service:new ProviderFolderService({a:left.api,b:right.api})};}
const prepare=(s,selection,options={})=>prepareProviderCopyInventory(s.service,'a',selection,{endpointKinds:kinds,...options});
test('recursive selected descendants and overlap, empty dirs, missing destination ancestry',async()=>{
 const s=setup({src:null,'src/nested':null,'src/nested/file':'text','src/empty':null,outside:'ignored'},{});const r=await prepare(s,['src','src/nested']);
 assert.deepEqual(r.selectedMappings.map(x=>x.source),['src/nested/file']);assert.deepEqual(r.requiredDirectories.map(x=>x.target),['src','src/empty','src/nested']);assert.ok(r.requiredDirectories.every(x=>!x.exists));assert.equal(r.coverage.mode,'complete-root-namespaces');assert.throws(()=>r.selectedMappings.push({}),TypeError);await revalidateProviderCopyInventory(r);
});
test('manual directory mapping honors both names for exclusions and includes',async()=>{
 const s=setup({src:null,'src/a.txt':'a','src/b.bin':'b'},{}),alignment=new FolderAlignment([{a:'src',b:'dest',kind:'directory'}],kinds);
 const r=await prepare(s,['src'],{alignment,scope:{include:'*.txt'}});assert.deepEqual(r.selectedMappings.map(x=>x.target),['dest/a.txt']);
 const excluded=await prepare(s,['src'],{alignment,scope:{exclude:'dest'}});assert.equal(excluded.selectedMappings.length,0);assert.equal(excluded.requiredDirectories.length,0);
});
test('text rules classification uses comparison evidence, neutral dirs remain unchecked',async()=>{
 const s=setup({src:null,'src/a':'HELLO','src/b':'left'},{src:null,'src/a':'hello','src/b':'rght'});
 const r=await prepare(s,['src'],{scope:{status:'same',rules:{mode:'text-case'}}});assert.deepEqual(r.selectedMappings.map(x=>x.source),['src/a']);assert.equal(r.rows.find(x=>x.pathA==='src').status,'unchecked');
});
test('same-size weak content changes revoke eligibility even with unchanged metadata',async()=>{
 const s=setup({a:'left'},{a:'rght'});const r=await prepare(s,['a'],{scope:{status:'diff'}});s.left.data.set('a','rght');await assert.rejects(revalidateProviderCopyInventory(r),{code:'STALE_SOURCE'});
});
test('temporary comparison changes restored before final digest are rejected',async()=>{
 const s=setup({a:'left'},{a:'left'});let reads=0;s.left.setHook((event,p)=>{if(event==='read'&&++reads===2)s.left.data.set(p,'rght');if(event==='read'&&reads===3)s.left.data.set(p,'left');});await assert.rejects(prepare(s,['a']),{code:'STALE_SOURCE'});
});
test('filename matching reconstructs complete namespaces outside selection',async()=>{
 const s=setup({selected:null,'selected/a':'one',outside:null,'outside/a':'two'},{moved:null,'moved/a':'two'});
 const namespace=values=>({entries:new Map(Object.entries(values).map(([p,v])=>[p,{kind:v===null?'directory':'file'}])),identity:'root',skipped:0});
 const partial=new FilenameMatching({a:namespace({selected:null,'selected/a':'one'}),b:namespace({moved:null,'moved/a':'two'})},new FolderAlignment([],kinds));
 const full=new FilenameMatching({a:namespace(Object.fromEntries(s.left.data)),b:namespace(Object.fromEntries(s.right.data))},new FolderAlignment([],kinds));
 const r=await prepare(s,['selected/a'],{alignment:partial});assert.equal(r.selectedMappings[0].target,full.counterpart('a','selected/a'));
});
test('reservations and file-directory conflicts fail without dropping selection',async()=>{
 const s=setup({a:'a',b:'b'},{dest:'x'}),alignment=new FolderAlignment([{a:'a',b:'b',kind:'file'}],kinds);await assert.rejects(prepare(s,['b'],{alignment}),/reserved/);
 await assert.rejects(prepare(setup({a:'file'},{a:null}),['a']),/conflict/);
});
test('namespace changes including outside selection invalidate retained authority',async()=>{
 const s=setup({a:'a'},{}),r=await prepare(s,['a']);s.right.data.set('new','file');await assert.rejects(revalidateProviderCopyInventory(r),{code:'STALE_SOURCE'});
});
test('remote colon names and explicit revocation, invalid selections before IO',async()=>{
 const s=setup({'C:名':'x'},{}),r=await prepare(s,['C:名']);assert.equal(r.selectedMappings[0].target,'C:名');revokeProviderCopyInventory(r);await assert.rejects(revalidateProviderCopyInventory(r),/revoked/);
 const invalid=setup({a:'a'},{});await assert.rejects(prepare(invalid,['../a']));assert.equal(invalid.left.calls.length,0);
});
test('cancellation during initial snapshot prevents published inventory',async()=>{
 const s=setup({a:'a'},{}),controller=new AbortController();s.left.setHook(event=>{if(event==='read')controller.abort();});await assert.rejects(prepare(s,['a'],{signal:controller.signal}),/abort|cancel/i);
});
test('unselected remote drive-shaped filename does not block safe local destination',async()=>{
 const s=setup({safe:'safe','C:notes':'other'},{});const r=await prepare(s,['safe'],{endpointKinds:{a:'remote',b:'local'}});assert.deepEqual(r.selectedMappings.map(x=>x.source),['safe']);await assert.rejects(prepare(s,['C:notes'],{endpointKinds:{a:'remote',b:'local'}}),/path/);
});
test('retained authority rejects provider endpoint replacement',async()=>{
 const s=setup({a:'a'},{}),r=await prepare(s,['a']),old=s.service.endpoint.bind(s.service),replacement=endpoint({a:'a'}).api;s.service.endpoint=side=>side==='a'?replacement:old(side);await assert.rejects(revalidateProviderCopyInventory(r),{code:'STALE_SOURCE'});
});
test('right-to-left mapped selected files and both endpoint ancestry',async()=>{
 const s=setup({dest:null},{src:null,'src/deep':null,'src/deep/a':'text'}),alignment=new FolderAlignment([{a:'dest',b:'src/deep',kind:'directory'}],kinds);
 const r=await prepareProviderCopyInventory(s.service,'b',['src/deep'],{endpointKinds:kinds,alignment});assert.equal(r.selectedMappings[0].target,'dest/a');assert.deepEqual(r.requiredDirectories,[{source:'src/deep',target:'dest',exists:true}]);
});
test('local destination aliases are rejected before returning review inventory',async()=>{
 const s=setup({Name:'source'},{name:'target'});await assert.rejects(prepare(s,['Name'],{endpointKinds:{a:'remote',b:'local'}}),/alias/);
});
test('newer-left requires an actual existing right file',async()=>{
 const s=setup({a:'new'},{});const r=await prepare(s,['a'],{scope:{status:'newer-left'}});assert.equal(r.selectedMappings.length,0);
});
test('unrelated destination parent conflict does not block independent selection',async()=>{
 const s=setup({bad:null,'bad/child':'bad',good:'safe'},{bad:'file'});const r=await prepare(s,['good']);assert.deepEqual(r.selectedMappings.map(x=>x.source),['good']);await assert.rejects(prepare(s,['bad/child']),/parent is a file/);
});
test('directory metadata classification is bound to exact captured observation',async()=>{
 const s=setup({dir:null},{dir:null}),compare=s.service.compareRows.bind(s.service);s.service.compareRows=async(...args)=>{const r=await compare(...args);r.evidence=r.evidence.map(e=>e.relative==='dir'?{...e,metadata:{...e.metadata,mtime:9999}}:e);return r;};await assert.rejects(prepare(s,['dir'],{scope:{rules:{compareFilename:true}}}),{code:'STALE_SOURCE'});
});
test('planned local targets and scaffolding cannot introduce case or Unicode aliases',async()=>{
 for(const values of [{Foo:'a',foo:'b'},{'é':'a','e\u0301':'b'},{Foo:null,'Foo/a':'a',foo:null,'foo/b':'b'}])await assert.rejects(prepare(setup(values,{}),[''],{endpointKinds:{a:'remote',b:'local'}}),/alias/);
});
test('mapped target unsupported namespace entries cannot become synthetic missing files',async()=>{
 const s=setup({a:'text'},{}),enumerate=s.right.api.enumerateDirectory.bind(s.right.api);s.right.api.enumerateDirectory=async function*(p){yield*enumerate(p);if(p==='')yield {name:'a',kind:'symlink'};};await assert.rejects(prepare(s,['a']),/unsupported/);
});
test('mapped destination descendants cannot cross ignored or special ancestors',async()=>{
 const ignored=setup({src:null,'src/a':'text'},{'.git':null,'.git/a':'old'}),alignment=new FolderAlignment([{a:'src',b:'.git',kind:'directory'}],kinds);await assert.rejects(prepare(ignored,['src/a'],{alignment}),/ignored|unsupported/);
 const special=setup({src:null,'src/a':'text'},{});special.right.api.enumerateDirectory=async function*(p){if(p==='')yield {name:'link',kind:'symlink'};};await assert.rejects(prepare(special,['src/a'],{alignment:new FolderAlignment([{a:'src',b:'link',kind:'directory'}],kinds)}),/ignored|unsupported/);
});
