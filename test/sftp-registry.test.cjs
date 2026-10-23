'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {SftpRegistry}=require('../desktop/sftp-registry.cjs');
const key='SHA256:'+'a'.repeat(43),otherKey='SHA256:'+'b'.repeat(43);
const auth={username:'fixture',password:'never-expose-this-password'};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const connection=(fingerprint=key)=>({fingerprint,closed:false,request(){},async close(){this.closed=true;}});
const make=(options={})=>new SftpRegistry({probe:async()=>key,connect:async()=>connection(),...options});
const approve=(registry,owner,review)=>registry.connect(owner,{attemptId:review.attemptId,approvalToken:review.approvalToken,approved:true,credentials:auth});
async function review(registry,owner,config={host:'Example.COM.',port:22},options){return registry.beginProbe(owner,config,options).review;}

test('probe normalizes binding, contains no credentials; connect pins and returns opaque safe metadata',async()=>{
 const owner={};let probed,connected;const registry=make({probe:async value=>{probed=value;return key;},connect:async value=>{connected=value;return connection();}});
 const r=await review(registry,owner);assert.equal(r.host,'example.com');assert.equal(r.previousFingerprint,null);assert.equal(probed.password,undefined);
 const metadata=await approve(registry,owner,r);assert.equal(connected.expectedFingerprint,key);assert.equal(connected.password,auth.password);assert.equal(connected.host,'example.com');assert.notEqual(metadata.connectionId,r.attemptId);assert.equal(metadata.username,auth.username);assert.equal(registry.list(owner).connections[0].username,auth.username);assert.deepEqual(Object.keys(metadata).sort(),['connectionId','fingerprint','host','port','username']);
 assert.equal(registry.getConnection(owner,metadata.connectionId).fingerprint,key);assert.equal(JSON.stringify(registry.list(owner)).includes(auth.password),false);assert.equal(JSON.stringify(registry.list(owner)).includes(r.approvalToken),false);
 const second=await review(registry,owner);assert.equal(second.previousFingerprint,key);assert.equal(second.keyChanged,false);await registry.disposeSession(owner);
});

test('owner isolation covers review token, connection handles, cancel, and disposal',async()=>{
 const registry=make(),owner={},stranger={};const r=await review(registry,owner);
 assert.throws(()=>approve(registry,stranger,r),{code:'NOT_FOUND'});assert.equal(registry.cancel(stranger,r.attemptId),false);
 const metadata=await approve(registry,owner,r);assert.throws(()=>registry.getConnection(stranger,metadata.connectionId),{code:'NOT_FOUND'});
 await registry.disposeSession(stranger);assert.equal(registry.getConnection(owner,metadata.connectionId).closed,false);await registry.disposeSession(owner);
 assert.throws(()=>registry.list(owner),{code:'SESSION_CLOSED'});
});

test('explicit approval and exact single-use token required; credentials cannot replace host binding',async()=>{
 const registry=make(),owner={},r=await review(registry,owner);
 assert.throws(()=>registry.connect(owner,{attemptId:r.attemptId,approvalToken:r.approvalToken,credentials:auth}),{code:'TRUST_REQUIRED'});
 assert.throws(()=>registry.connect(owner,{attemptId:r.attemptId,approvalToken:'wrong',approved:true,credentials:auth}),{code:'TRUST_REQUIRED'});
 assert.throws(()=>registry.connect(owner,{attemptId:r.attemptId,approvalToken:r.approvalToken,approved:true,credentials:{...auth,host:'evil'}}),{code:'INVALID_OPTIONS'});
 const pending=approve(registry,owner,r);assert.throws(()=>approve(registry,owner,r),{code:'TRUST_REQUIRED'});await pending;assert.throws(()=>approve(registry,owner,r),{code:'NOT_FOUND'});await registry.disposeSession(owner);
});

test('expired tokens cannot connect even before expiry timer executes',async()=>{
 let now=100;const registry=make({now:()=>now,reviewLifetimeMs:10}),owner={},r=await review(registry,owner);now=110;
 assert.throws(()=>approve(registry,owner,r),{code:'TRUST_EXPIRED'});assert.equal(registry.list(owner).attempts.length,0);await registry.disposeSession(owner);
});

test('probe rejects secrets and invalid host/port before transport use',async()=>{
 const registry=make({probe:()=>assert.fail('must not probe')}),owner={};
 for(const config of [{host:'a',password:auth.password},{host:'a',username:'name'},{host:'a/b'},{host:'a',port:0},{host:'a',port:'22'},{host:'a',connectTimeoutMs:0}])assert.throws(()=>registry.beginProbe(owner,config),{code:'INVALID_OPTIONS'});
 await registry.disposeSession(owner);
});

test('cancelled and superseded probes cannot produce review authority',async()=>{
 const pending=deferred();let signal;const registry=make({probe:async options=>{signal=options.signal;return pending.promise;}}),owner={};
 const first=registry.beginProbe(owner,{host:'first'});await Promise.resolve();const rejection=assert.rejects(first.review,{code:'ABORT_ERR'});
 const second=registry.beginProbe(owner,{host:'second'});assert.equal(signal.aborted,true);registry.cancel(owner,second.attemptId);pending.resolve(key);await rejection;await assert.rejects(second.review,{code:'ABORT_ERR'});assert.deepEqual(registry.list(owner).attempts,[]);await registry.disposeSession(owner);
});

test('late connect success after cancellation closes transport and cannot commit a pin',async()=>{
 const pending=deferred(),opened=connection();const registry=make({connect:()=>pending.promise}),owner={},r=await review(registry,owner);
 const job=approve(registry,owner,r);await Promise.resolve();registry.cancel(owner,r.attemptId);pending.resolve(opened);await assert.rejects(job,{code:'ABORT_ERR'});assert.equal(opened.closed,true);assert.equal(registry.list(owner).connections.length,0);
 assert.equal((await review(registry,owner)).previousFingerprint,null);await registry.disposeSession(owner);
});

test('new review supersedes in-flight connect while preserving existing ready connections',async()=>{
 const pending=deferred(),ready=connection(),late=connection();let calls=0;const registry=make({connect:()=>++calls===1?ready:pending.promise}),owner={};
 const original=await approve(registry,owner,await review(registry,owner));const r=await review(registry,owner),job=approve(registry,owner,r);await Promise.resolve();await review(registry,owner);pending.resolve(late);await assert.rejects(job,{code:'ABORT_ERR'});
 assert.equal(late.closed,true);assert.equal(registry.getConnection(owner,original.connectionId),ready);assert.equal(ready.closed,false);await registry.disposeSession(owner);assert.equal(ready.closed,true);
});

test('changed handshake key is rejected and closed; subsequent review discloses changed transient pin',async()=>{
 let fingerprint=key;const opened=[];const registry=make({probe:async()=>fingerprint,connect:async()=>{const result=connection(fingerprint);opened.push(result);return result;}}),owner={};
 await approve(registry,owner,await review(registry,owner));const r=await review(registry,owner);fingerprint=otherKey;
 await assert.rejects(approve(registry,owner,r),{code:'HOST_KEY_UNTRUSTED'});assert.equal(opened[1].closed,true);
 const changed=await review(registry,owner);assert.equal(changed.keyChanged,true);assert.equal(changed.previousFingerprint,key);assert.equal(changed.fingerprint,otherKey);await registry.disposeSession(owner);
});

test('dispose revokes immediately and waits for aborting probe cleanup',async()=>{
 const gate=deferred();let signal;const registry=make({probe:async options=>{signal=options.signal;return gate.promise;}}),owner={};
 const attempt=registry.beginProbe(owner,{host:'server'});await Promise.resolve();const rejected=assert.rejects(attempt.review,{code:'ABORT_ERR'});let done=false;const disposal=registry.disposeSession(owner).then(()=>{done=true;});await Promise.resolve();assert.equal(signal.aborted,true);assert.equal(done,false);assert.throws(()=>registry.list(owner),{code:'SESSION_CLOSED'});gate.resolve(key);await rejected;await disposal;assert.equal(done,true);
});

test('dispose waits for late successful connect close as well as ready connection cleanup',async()=>{
 const gate=deferred(),closed=deferred(),opened=connection();opened.close=async()=>{await closed.promise;opened.closed=true;};const registry=make({connect:()=>gate.promise}),owner={};
 const r=await review(registry,owner),job=approve(registry,owner,r);await Promise.resolve();const rejected=assert.rejects(job,{code:'ABORT_ERR'});let done=false;const disposal=registry.disposeSession(owner).then(()=>{done=true;});gate.resolve(opened);await Promise.resolve();await Promise.resolve();assert.equal(done,false);closed.resolve();await rejected;await disposal;assert.equal(opened.closed,true);await registry.disposeSession(owner);
});

test('transport errors and cleanup errors cannot leak credentials',async()=>{
 const raw=Object.assign(new Error(auth.password),{code:'AUTH_FAILED',password:auth.password,cause:auth.password});const owner={},registry=make({connect:async()=>{throw raw;}});
 await assert.rejects(approve(registry,owner,await review(registry,owner)),error=>error.code==='AUTH_FAILED'&&!JSON.stringify(error).includes(auth.password)&&!error.message.includes(auth.password));await registry.disposeSession(owner);
 const second={},bad=make({probe:async()=>{throw raw;}});await assert.rejects(review(bad,second),error=>error.message==='SFTP authentication failed.');await bad.disposeSession(second);
 const third={},c=connection();c.close=()=>{throw raw;};const cleanup=make({connect:async()=>c});const meta=await approve(cleanup,third,await review(cleanup,third));await assert.rejects(cleanup.disconnect(third,meta.connectionId),error=>!error.message.includes(auth.password));assert.equal(cleanup.list(third).connections.length,0);await cleanup.disposeSession(third);
});

test('native retain creates isolated child handles and parent disposal preserves connection',async()=>{
 const opened=connection();let closes=0;opened.close=async()=>{closes++;opened.closed=true;};
 const registry=make({connect:async()=>opened}),parent={},child={},stranger={};
 const original=await approve(registry,parent,await review(registry,parent));
 const retained=registry.retainConnection(parent,original.connectionId,child);
 assert.equal(retained.username,auth.username);assert.equal(typeof retained.then,'undefined');assert.notEqual(retained.connectionId,original.connectionId);
 assert.equal(registry.getConnection(child,retained.connectionId),opened);
 assert.throws(()=>registry.getConnection(parent,retained.connectionId),{code:'NOT_FOUND'});
 assert.throws(()=>registry.getConnection(child,original.connectionId),{code:'NOT_FOUND'});
 assert.throws(()=>registry.retainConnection(stranger,original.connectionId,child),{code:'NOT_FOUND'});
 assert.equal(JSON.stringify(registry.list(child)).includes(auth.password),false);
 assert.equal((await review(registry,child)).previousFingerprint,key);
 await registry.disposeSession(parent);assert.equal(closes,0);assert.equal(registry.getConnection(child,retained.connectionId),opened);
 await registry.disposeSession(child);assert.equal(closes,1);await registry.disposeSession(child);assert.equal(closes,1);
});

test('disconnect releases only its handle and last descendant release closes once',async()=>{
 const opened=connection();let closes=0;opened.close=async()=>{closes++;opened.closed=true;};
 const registry=make({connect:async()=>opened}),parent={},child={},grandchild={};
 const original=await approve(registry,parent,await review(registry,parent));
 const retained=registry.retainConnection(parent,original.connectionId,child),descendant=registry.retainConnection(child,retained.connectionId,grandchild);
 assert.equal(await registry.disconnect(child,retained.connectionId),true);assert.equal(await registry.disconnect(child,retained.connectionId),false);
 assert.equal(closes,0);await registry.disposeSession(parent);assert.equal(closes,0);
 assert.equal(registry.getConnection(grandchild,descendant.connectionId),opened);
 assert.equal(await registry.disconnect(grandchild,descendant.connectionId),true);assert.equal(closes,1);
 await Promise.all([registry.disposeSession(child),registry.disposeSession(grandchild)]);assert.equal(closes,1);
});

test('retain rejects closed and disposed authority without leaking a reference',async()=>{
 const registry=make(),parent={},child={};const original=await approve(registry,parent,await review(registry,parent));
 const opened=registry.getConnection(parent,original.connectionId);await registry.disposeSession(child);
 assert.throws(()=>registry.retainConnection(parent,original.connectionId,child),{code:'SESSION_CLOSED'});
 assert.throws(()=>registry.retainConnection(parent,'missing',{}),{code:'NOT_FOUND'});
 await opened.close();assert.throws(()=>registry.retainConnection(parent,original.connectionId,{}),{code:'CONNECTION_CLOSED'});
 await registry.disposeSession(parent);assert.throws(()=>registry.retainConnection(parent,original.connectionId,{}),{code:'SESSION_CLOSED'});
});

test('physical transport failure remains visible to all retained owners',async()=>{
 const registry=make(),parent={},child={};const original=await approve(registry,parent,await review(registry,parent));
 const retained=registry.retainConnection(parent,original.connectionId,child);await registry.getConnection(parent,original.connectionId).close();
 assert.throws(()=>registry.getConnection(child,retained.connectionId),{code:'CONNECTION_CLOSED'});
 assert.equal(registry.list(parent).connections[0].closed,true);assert.equal(registry.list(child).connections[0].closed,true);
 await Promise.all([registry.disposeSession(parent),registry.disposeSession(child)]);
});

test('retain enforces target capacity and final release waits for transport cleanup',async()=>{
 const gate=deferred(),opened=connection();let closes=0;opened.close=async()=>{closes++;await gate.promise;opened.closed=true;};
 const registry=make({connect:async()=>opened}),parent={},child={};const original=await approve(registry,parent,await review(registry,parent));
 for(let i=0;i<32;i++)registry.retainConnection(parent,original.connectionId,child);
 assert.throws(()=>registry.retainConnection(parent,original.connectionId,child),{code:'LIMIT_REACHED'});
 await registry.disposeSession(parent);assert.equal(closes,0);
 let done=false;const cleanup=registry.disposeSession(child).then(()=>{done=true;});await Promise.resolve();assert.equal(closes,1);assert.equal(done,false);
 gate.resolve();await cleanup;assert.equal(done,true);assert.equal(closes,1);
});
