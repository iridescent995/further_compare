'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {SftpRegistry}=require('../desktop/sftp-registry.cjs');
const key='SHA256:'+'a'.repeat(43),other='SHA256:'+'b'.repeat(43),third='SHA256:'+'c'.repeat(43);
const auth={username:'fixture',password:'secret-not-for-errors'};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture({saved=null,probe=async()=>key,connect,lookup,remember,forget}={}){
 const state={saved,calls:0,writes:0,opened:[]};
 const knownHosts={
  lookup:lookup|| (async()=>state.saved),
  forget:forget|| (async(endpoint,expected,{current})=>{current();if(state.saved!==expected)throw Object.assign(new Error('conflict'),{code:'KNOWN_HOST_CHANGED'});state.saved=null;}),
  remember:remember|| (async(endpoint,fingerprint,expected,{current})=>{
   current();if(state.saved!==expected)throw Object.assign(new Error('conflict'),{code:'KNOWN_HOST_CHANGED'});
   state.saved=fingerprint;state.writes++;return fingerprint;
  })
 };
 const registry=new SftpRegistry({knownHosts,probe,connect:connect|| (async()=>{
  state.calls++;const c={fingerprint:key,closed:false,request(){},async close(){this.closed=true;}};state.opened.push(c);return c;
 })});
 const review=owner=>registry.beginProbe(owner,{host:'EXAMPLE.com.',port:22}).review;
 const approve=(owner,r,options={})=>registry.connect(owner,{attemptId:r.attemptId,approvalToken:r.approvalToken,approved:true,credentials:auth,...options});
 return {state,registry,review,approve};
}
test('saved matching key is displayed but never authorizes a connection',async()=>{
 const f=fixture({saved:key}),owner={},r=await f.review(owner);
 assert.equal(r.savedFingerprint,key);assert.equal(r.knownHost,true);assert.equal(r.rememberSupported,true);assert.equal(r.keyChanged,false);
 assert.throws(()=>f.approve(owner,r,{approved:false}),{code:'TRUST_REQUIRED'});assert.equal(f.state.calls,0);
 await f.approve(owner,r);assert.equal(f.state.writes,0);await f.registry.disposeSession(owner);
});
test('new fingerprints persist only with strict boolean opt-in after a verified transport',async()=>{
 const f=fixture(),owner={},r=await f.review(owner);
 assert.equal(r.savedFingerprint,null);assert.equal(r.knownHost,false);
 for(const rememberHost of [1,'true',null,{}])assert.throws(()=>f.approve(owner,r,{rememberHost}),{code:'INVALID_OPTIONS'});
 await f.approve(owner,r,{rememberHost:true});assert.equal(f.state.saved,key);assert.equal(f.state.writes,1);
 const nextOwner={},next=await f.review(nextOwner);assert.equal(next.knownHost,true);await f.registry.disposeSession(nextOwner);await f.registry.disposeSession(owner);
});
test('saved key takes precedence over session pin; approved replacement requires fresh review',async()=>{
 const f=fixture({saved:other}),owner={};
 await f.approve(owner,await f.review(owner));assert.equal(f.state.saved,other);
 const r=await f.review(owner);assert.equal(r.previousFingerprint,other);assert.equal(r.keyChanged,true);
 await f.approve(owner,r,{rememberHost:true});assert.equal(f.state.saved,key);await f.registry.disposeSession(owner);
});
test('concurrent saved key change fails before authentication when remembering',async()=>{
 const f=fixture({saved:other}),owner={},r=await f.review(owner);f.state.saved=third;
 await assert.rejects(f.approve(owner,r,{rememberHost:true}),{code:'KNOWN_HOST_CHANGED'});
 assert.equal(f.state.calls,0);assert.equal(f.state.saved,third);assert.equal(f.registry.list(owner).connections.length,0);await f.registry.disposeSession(owner);
});
test('concurrent store change during authentication fails CAS and closes transport',async()=>{
 const gate=deferred();
 const transport={fingerprint:key,closed:false,request(){},async close(){this.closed=true;}};
 const second=fixture({connect:async()=>{await gate.promise;return transport;}});
 const secondOwner={},review=await second.review(secondOwner),job=second.approve(secondOwner,review,{rememberHost:true});
 await Promise.resolve();await Promise.resolve();second.state.saved=other;gate.resolve();
 await assert.rejects(job,{code:'KNOWN_HOST_CHANGED'});assert.equal(transport.closed,true);assert.equal(second.state.saved,other);
 assert.equal(second.registry.list(secondOwner).connections.length,0);await second.registry.disposeSession(secondOwner);
});
test('failed persistence closes verified transport, exposes only safe error, registers no pin',async()=>{
 const f=fixture({remember:async()=>{throw Object.assign(new Error(auth.password),{code:'KNOWN_HOST_STORE_IO'});}}),owner={};
 await assert.rejects(f.approve(owner,await f.review(owner),{rememberHost:true}),error=>error.code==='KNOWN_HOST_STORE_IO'&&!error.message.includes(auth.password));
 assert.equal(f.state.opened[0].closed,true);assert.equal(f.registry.list(owner).connections.length,0);
 assert.equal((await f.review(owner)).previousFingerprint,null);await f.registry.disposeSession(owner);
});
test('cancel during persistence invokes current guard and closes transport without writing',async()=>{
 const gate=deferred(),entered=deferred();let writes=0;
 const f=fixture({remember:async(e,k,p,{current})=>{entered.resolve();await gate.promise;current();writes++;}}),owner={},r=await f.review(owner);
 const job=f.approve(owner,r,{rememberHost:true});await entered.promise;f.registry.cancel(owner,r.attemptId);gate.resolve();
 await assert.rejects(job,{code:'ABORT_ERR'});assert.equal(writes,0);assert.equal(f.state.opened[0].closed,true);assert.equal(f.registry.list(owner).connections.length,0);await f.registry.disposeSession(owner);
});
test('cancel during preauthentication lookup cannot send credentials',async()=>{
 const gate=deferred(),entered=deferred();let reads=0;
 const f=fixture({lookup:async()=>{if(++reads===2){entered.resolve();await gate.promise;}return null;}}),owner={},r=await f.review(owner);
 const job=f.approve(owner,r,{rememberHost:true});await entered.promise;f.registry.cancel(owner,r.attemptId);gate.resolve();
 await assert.rejects(job,{code:'ABORT_ERR'});assert.equal(f.state.calls,0);await f.registry.disposeSession(owner);
});
test('invalid saved values fail closed and do not create review tokens',async()=>{
 for(const value of [undefined,'bad',{},123]){
  const f=fixture({lookup:async()=>value}),owner={};await assert.rejects(f.review(owner),{code:'KNOWN_HOST_STORE_INVALID'});
  assert.equal(f.registry.list(owner).attempts.length,0);assert.equal(f.state.calls,0);await f.registry.disposeSession(owner);
 }
});
test('mismatched transport key never reaches persistence',async()=>{
 const c={fingerprint:other,closed:false,request(){},async close(){this.closed=true;}};
 const f=fixture({connect:async()=>c}),owner={};await assert.rejects(f.approve(owner,await f.review(owner),{rememberHost:true}),{code:'HOST_KEY_UNTRUSTED'});
 assert.equal(f.state.writes,0);assert.equal(c.closed,true);await f.registry.disposeSession(owner);
});
test('registry without native store rejects remembering and reports unsupported',async()=>{
 const registry=new SftpRegistry({probe:async()=>key}),owner={},r=await registry.beginProbe(owner,{host:'example.com'}).review;
 assert.equal(r.rememberSupported,false);assert.equal(r.savedFingerprint,null);assert.equal(r.knownHost,false);
 assert.throws(()=>registry.connect(owner,{attemptId:r.attemptId,approvalToken:r.approvalToken,approved:true,credentials:auth,rememberHost:true}),{code:'KNOWN_HOST_STORE_IO'});
 await registry.disposeSession(owner);
});
test('two reviewed owners cannot overwrite a newer saved decision',async()=>{
 const f=fixture(),first={},second={},r1=await f.review(first),r2=await f.review(second);
 await f.approve(first,r1,{rememberHost:true});
 await assert.rejects(f.approve(second,r2,{rememberHost:true}),{code:'KNOWN_HOST_CHANGED'});
 assert.equal(f.state.calls,1);assert.equal(f.state.writes,1);assert.equal(f.state.saved,key);
 await Promise.all([f.registry.disposeSession(first),f.registry.disposeSession(second)]);
});
test('lookup errors expose native safe codes without filesystem paths or details',async()=>{
 const f=fixture({lookup:async()=>{throw Object.assign(new Error('/private/secret/path '+auth.password),{code:'KNOWN_HOST_STORE_INVALID'});}}),owner={};
 await assert.rejects(f.review(owner),error=>error.code==='KNOWN_HOST_STORE_INVALID'&&!error.message.includes('/private')&&!error.message.includes(auth.password));
 await f.registry.disposeSession(owner);
});
test('forget is bound to review owner and token, consumes review and requires reprobe',async()=>{
 const f=fixture({saved:key}),owner={},r=await f.review(owner);
 assert.throws(()=>f.registry.forgetHost({},r),{code:'NOT_FOUND'});
 assert.throws(()=>f.registry.forgetHost(owner,{...r,approvalToken:'wrong'}),{code:'TRUST_REQUIRED'});
 const job=f.registry.forgetHost(owner,r);
 assert.throws(()=>f.approve(owner,r),{code:'TRUST_REQUIRED'});
 assert.throws(()=>f.registry.forgetHost(owner,r),{code:'TRUST_REQUIRED'});
 assert.deepEqual(await job,{forgotten:true});assert.equal(f.state.saved,null);
 assert.throws(()=>f.approve(owner,r),{code:'NOT_FOUND'});assert.equal(f.state.calls,0);
 assert.equal((await f.review(owner)).savedFingerprint,null);await f.registry.disposeSession(owner);
});
test('forget cannot remove a saved key changed since review',async()=>{
 const f=fixture({saved:key}),owner={},r=await f.review(owner);f.state.saved=other;
 await assert.rejects(f.registry.forgetHost(owner,r),{code:'KNOWN_HOST_CHANGED'});
 assert.equal(f.state.saved,other);assert.throws(()=>f.approve(owner,r),{code:'NOT_FOUND'});await f.registry.disposeSession(owner);
});
test('cancelled forget does not mutate saved trust and disposal waits for cleanup',async()=>{
 const gate=deferred(),entered=deferred();let writes=0;
 const f=fixture({saved:key,forget:async(e,k,{current})=>{entered.resolve();await gate.promise;current();writes++;}}),owner={},r=await f.review(owner);
 const job=f.registry.forgetHost(owner,r),rejected=assert.rejects(job,{code:'ABORT_ERR'});await entered.promise;
 let done=false;const disposal=f.registry.disposeSession(owner).then(()=>{done=true;});await Promise.resolve();assert.equal(done,false);
 gate.resolve();await rejected;await disposal;assert.equal(writes,0);assert.equal(f.state.saved,key);
});
test('forget rejects expired review and reviews without a saved key',async()=>{
 let now=0;const registry=new SftpRegistry({probe:async()=>key,knownHosts:{lookup:async()=>key,remember:async()=>{},forget:async()=>assert.fail('expired')},now:()=>now,reviewLifetimeMs:10}),owner={};
 const r=await registry.beginProbe(owner,{host:'example.com'}).review;now=11;
 assert.throws(()=>registry.forgetHost(owner,r),{code:'TRUST_EXPIRED'});await registry.disposeSession(owner);
 const f=fixture(),otherOwner={},empty=await f.review(otherOwner);assert.throws(()=>f.registry.forgetHost(otherOwner,empty),{code:'KNOWN_HOST_INVALID'});await f.registry.disposeSession(otherOwner);
});
test('transport timeout options never leak into strict known-host endpoints',async()=>{
 const expected={host:'example.com',port:2222};let saved=null,reads=0,writes=0,forgets=0;
 const knownHosts={
  lookup:async endpoint=>{assert.deepEqual(endpoint,expected);reads++;return saved;},
  remember:async(endpoint,value,previous,{current})=>{current();assert.deepEqual(endpoint,expected);assert.equal(previous,null);saved=value;writes++;},
  forget:async(endpoint,previous,{current})=>{current();assert.deepEqual(endpoint,expected);assert.equal(previous,key);saved=null;forgets++;}
 };
 const registry=new SftpRegistry({knownHosts,probe:async options=>{assert.equal(options.connectTimeoutMs,7000);return key;},connect:async options=>{
  assert.equal(options.requestTimeoutMs,8000);return {fingerprint:key,closed:false,request(){},async close(){this.closed=true;}};
 }}),owner={},config={host:'EXAMPLE.COM.',port:2222,connectTimeoutMs:7000,requestTimeoutMs:8000};
 const r=await registry.beginProbe(owner,config).review;
 await registry.connect(owner,{attemptId:r.attemptId,approvalToken:r.approvalToken,approved:true,credentials:auth,rememberHost:true});
 const r2=await registry.beginProbe(owner,config).review;await registry.forgetHost(owner,r2);
 assert.equal(reads,3);assert.equal(writes,1);assert.equal(forgets,1);await registry.disposeSession(owner);
});
