'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
// Execute the native shell handler and its real owner-capture helper, isolating dialogs and disk reads.
const source=fs.readFileSync(path.join(__dirname,'../desktop/window-runtime.cjs'),'utf8');
const owner=source.slice(source.indexOf('function openOwner('),source.indexOf('\nfunction pdfReadOptions',source.indexOf('function openOwner(')));
const block=source.slice(source.indexOf("  handle('shell:take'"),source.indexOf("  handle('session:compare-parents'"));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function harness({choices=['text-compare','binary-compare'],response=1,dialogHook,takeHook,validateHook}={}){
 const dialogs=[],created=[],validation=[],descriptor=Object.freeze({left:Object.freeze({name:'left.csv',path:'/tmp/left\n"\u202e.csv'}),right:Object.freeze({name:'right.txt',path:'/tmp/right.txt'}),choices:Object.freeze(choices.slice())});let handler;
 const context={activeId:'original',activationGeneration:1,folders:{backupRoot:'/isolated'},disposed:false,shared:{isShellRecipient:()=>true},mainWindow:{},Set,Map,BigInt,Error,JSON,Number,Array,Object,randomUUID:()=> 'native-token',protectedDataSourceKind:()=> 'pdf',textPaths:{},textFormats:{},textInputEncodings:{},textProjections:{},revisions:{},dataAuthorities:new Map(),handle:(_channel,fn)=>handler=fn,createContext:()=>{created.push(context.activeId);context.activeId='created';context.activationGeneration++;return {id:'created'};},dialog:{showMessageBox:async(window,options)=>{assert.equal(window,context.mainWindow);dialogs.push(options);if(dialogHook)return dialogHook(options,context);return {response};}},shellRequests:{take:async callbacks=>{
  if(takeHook)return takeHook(callbacks,context);
  const mode=await callbacks.reviewComparison(descriptor);if(mode==='cancel')return {action:'cancelled'};
  return {action:'compare',mode,a:{name:'left.csv',path:descriptor.left.path,content:'left',format:{encoding:'utf8'},...(mode==='binary-compare'?{data:'bGVmdA=='}:{})},b:{name:'right.txt',path:descriptor.right.path,content:'right',format:{encoding:'utf8'}}};
 },validateFiles:async request=>{validation.push(request);if(validateHook)await validateHook(context);return {a:{path:request.a.path,revision:'original-a',dev:'1',ino:'2'},b:{path:request.b.path,revision:'original-b',dev:'1',ino:'3'}};}}};
 vm.runInNewContext(owner+'\n'+block,context);return {run:()=>handler(),context,dialogs,created,validation};
}
test('native comparison review offers filtered labels, Cancel default and escaped literal paths',async()=>{
 const h=harness();const result=await h.run(),dialog=h.dialogs[0];assert.deepEqual(Array.from(dialog.buttons),['Cancel','Text','Binary']);assert.equal(dialog.defaultId,0);assert.equal(dialog.cancelId,0);assert.equal(dialog.noLink,true);assert.match(dialog.detail,/left\\n\\"\\u\{202e\}/);assert(!dialog.detail.includes('\u202e'));assert.equal(result.mode,'text-compare');assert.equal(h.context.textPaths.a,'/tmp/left\n"\u202e.csv');assert.equal(h.context.revisions.a,'original-a');assert.equal(h.created.length,1);
 const binary=harness({choices:['binary-compare']});const b=await binary.run();assert.deepEqual(Array.from(binary.dialogs[0].buttons),['Cancel','Binary']);assert.equal(b.mode,'binary-compare');assert.equal(b.a.diskToken,'native-token');assert.equal(binary.context.dataAuthorities.get('native-token').sourceKind,'pdf');
});
test('cancel and closed dialog responses never create sessions or validate source authority',async()=>{
 for(const response of [0,-1,3,undefined]){const h=harness({response});if(response===undefined)h.context.dialog.showMessageBox=async()=>({});assert.equal((await h.run()).action,'cancelled');assert.equal(h.created.length,0);assert.equal(h.validation.length,0);assert.equal(h.context.dataAuthorities.size,0);}
});
test('native review refuses stale activation, switch-away/back, closed owner and late snapshot validation',async()=>{
 for(const change of [c=>c.activeId='other',c=>c.activationGeneration+=2,c=>c.disposed=true,c=>c.folders={backupRoot:'/other'}]){
  const held=deferred(),h=harness({dialogHook:()=>held.promise}),pending=h.run();await Promise.resolve();change(h.context);held.resolve({response:1});await assert.rejects(pending,/active comparison changed/);assert.equal(h.created.length,0);assert.equal(h.validation.length,0);
 }
 const late=harness({validateHook:async c=>{c.activationGeneration++;}});await assert.rejects(late.run(),/active comparison changed/);assert.equal(late.created.length,0);assert.equal(late.context.dataAuthorities.size,0);
});
test('owner is captured before dispatcher resolution even without any review',async()=>{
 const h=harness({takeHook:async(_callbacks,c)=>{c.activationGeneration++;return {action:'compare',mode:'binary-compare',a:{path:'/tmp/a'},b:{path:'/tmp/b'}};}});await assert.rejects(h.run(),/active comparison changed/);assert.equal(h.created.length,0);assert.equal(h.validation.length,0);
});
test('URL and selection reviews retain behavior and are owner guarded individually',async()=>{
 const h=harness({response:1,takeHook:async callbacks=>{assert.equal(await callbacks.reviewURL({command:'--fc-compare-selected',files:[{path:'/tmp/a'},{path:'/tmp/b'}]}),true);assert.equal(await callbacks.reviewSelection({left:{path:'/tmp/a'},right:{path:'/tmp/b'},kind:'file'}),'compare');return {action:'cancelled'};}});assert.equal((await h.run()).action,'cancelled');assert.deepEqual(h.dialogs.map(d=>d.message),['Allow file comparison request?','Compare selected items']);assert.equal(h.dialogs[0].defaultId,0);assert.equal(h.dialogs[1].defaultId,1);
 for(const which of ['reviewURL','reviewSelection']){const bad=harness({dialogHook:async(_opts,c)=>{c.disposed=true;return {response:1};},takeHook:callbacks=>callbacks[which](which==='reviewURL'?{command:'--fc-set-left',files:[{path:'/tmp/a'}]}:{left:{path:'/tmp/a'},right:{path:'/tmp/b'},kind:'file'})});await assert.rejects(bad.run(),/active comparison changed/);assert.equal(bad.created.length,0);}
});
test('unoffered or repeated native choices cannot be presented; normal shell calls remain serialized',async()=>{
 for(const choices of [[],['table-compare'],['binary-compare','binary-compare']]){const h=harness({choices});await assert.rejects(h.run(),/Invalid shell comparison choices/);assert.equal(h.dialogs.length,0);}
 const main=fs.readFileSync(path.join(__dirname,'../desktop/main.cjs'),'utf8');assert.match(main,/operationQueue\.schedule\([\s\S]*owner\.handlers\.get\(channel\)/);assert(!source.includes("immediateHandlers.set('shell:take'"));
});
