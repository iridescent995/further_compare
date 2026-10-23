'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {ShellRequests}=require('../desktop/shell-requests.cjs');
const {createLeftHintPublisher}=require('../desktop/explorer-left-hint.cjs');
async function fixture(fn){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-hint-observer-')));try{const input=path.join(root,'sample.txt');await fs.writeFile(input,'content');await fn(root,input);}finally{await fs.rm(root,{recursive:true,force:true});}}
test('set and clear persist in invocation order while hint publication is slow',()=>fixture(async(root,input)=>{
 let release;const gate=new Promise(resolve=>release=resolve),seen=[];
 const publish=createLeftHintPublisher(async bytes=>{seen.push(bytes.subarray(10).toString('utf16le'));if(seen.length===1)await gate;});
 const requests=new ShellRequests(path.join(root,'left.json'),{publishHint:publish});
 const selected=requests.setLeft(input),cleared=requests.clear();assert.equal((await selected).left.name,'sample.txt');assert.deepEqual(await cleared,{left:null,available:false});assert.deepEqual(await requests.state(),{left:null,available:false});
 assert.deepEqual(seen,['sample.txt']);release();await requests.hintPending;assert.deepEqual(seen,['sample.txt','']);await assert.rejects(fs.stat(path.join(root,'left.json')), {code:'ENOENT'});
}));
test('unchanged hints are deduplicated, failed hints retry, and observers receive no path',()=>fixture(async(root,input)=>{
 const seen=[];let fail=true;const requests=new ShellRequests(path.join(root,'left.json'),{publishHint:async state=>{seen.push(state);assert.ok(!state.left||!Object.hasOwn(state.left,'path'));if(fail)throw Error('registry denied');}});
 await requests.setLeft(input);await requests.hintPending;assert.equal(seen.length,1);assert.equal((await requests.readState()).left.path,input);
 fail=false;await requests.state();await requests.hintPending;await requests.state();assert.equal(seen.length,2);
 await fs.rm(input);const unavailable=await requests.state();assert.equal(unavailable.available,false);await requests.hintPending;assert.equal(seen.length,3);assert.deepEqual(seen.at(-1),{left:{name:'sample.txt',kind:'file'},available:false});
}));
test('failed selection mutation does not poison queued clear or publish a false selection',()=>fixture(async(root)=>{
 const seen=[],requests=new ShellRequests(path.join(root,'left.json'),{publishHint:async state=>seen.push(state)});
 const invalid=requests.setLeft(path.join(root,'missing')),clear=requests.clear();await assert.rejects(invalid,{code:'ENOENT'});assert.deepEqual(await clear,{left:null,available:false});await requests.hintPending;assert.deepEqual(seen,[{left:null,available:false}]);
}));

test('explicit integration refresh republishes unchanged selection after installation',()=>fixture(async(root,input)=>{
 const seen=[];let owned=false;const requests=new ShellRequests(path.join(root,'left.json'),{publishHint:async state=>{seen.push(state);return {written:owned,skipped:!owned};}});
 await requests.setLeft(input);await requests.hintPending;await requests.state();assert.equal(seen.length,1);
 owned=true;assert.equal((await requests.refreshHint()).left.name,'sample.txt');assert.equal(seen.length,2);assert.deepEqual(seen[0],seen[1]);
 await requests.state();assert.equal(seen.length,2);
}));
