'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {SftpRegistry}=require('../desktop/sftp-registry.cjs');
const {createSftpServer}=require('./sftp-server-fixture.cjs');
const credentials={username:'fixture-user',password:'fixture-secret'};
async function until(check){const deadline=Date.now()+2000;while(!check()){if(Date.now()>deadline)throw Error('Transport cleanup deadline exceeded');await new Promise(resolve=>setTimeout(resolve,10));}}
async function setup(t,config){const server=await createSftpServer(config),registry=new SftpRegistry(),owner={};t.after(async()=>{await registry.disposeSession(owner);await server.close();});return {server,registry,owner,settings:{host:server.host,port:server.port,connectTimeoutMs:1500,requestTimeoutMs:1000}};}
test('native registry reviews before authentication and owns a working transport',{timeout:6000},async t=>{
 const {server,registry,owner,settings}=await setup(t);
 const {review}=registry.beginProbe(owner,settings),approval=await review;
 assert.equal(approval.fingerprint,server.fingerprint);assert.equal(approval.previousFingerprint,null);
 assert.deepEqual(server.events.auth,[]);
 assert.throws(()=>registry.connect(owner,{...approval,credentials}),{code:'TRUST_REQUIRED'});
 const metadata=await registry.connect(owner,{...approval,approved:true,credentials});
 const connection=registry.getConnection(owner,metadata.connectionId);
 assert.equal((await connection.request('stat',['/fixture/file']))[0].size,7);
 assert.throws(()=>registry.getConnection({},metadata.connectionId),{code:'NOT_FOUND'});
 assert.ok(!JSON.stringify(registry.list(owner)).includes(credentials.password));
 await registry.disconnect(owner,metadata.connectionId);await until(()=>server.clients.size===0);
 const second=await registry.beginProbe(owner,settings).review;
 assert.equal(second.previousFingerprint,server.fingerprint);assert.equal(second.keyChanged,false);
 assert.equal(registry.cancel(owner,second.attemptId),true);
 await registry.disposeSession(owner);assert.throws(()=>registry.list(owner),{code:'SESSION_CLOSED'});
});
test('disposing registry during real authentication cancels and cleans up',{timeout:6000},async t=>{
 const {server,registry,owner,settings}=await setup(t,{holdAuth:true});
 const approval=await registry.beginProbe(owner,settings).review;
 const pending=registry.connect(owner,{...approval,approved:true,credentials});
 const rejected=assert.rejects(pending,{code:'ABORT_ERR'});
 await until(()=>server.events.auth.length>0);
 await registry.disposeSession(owner);await rejected;await until(()=>server.clients.size===0);
 assert.throws(()=>registry.list(owner),{code:'SESSION_CLOSED'});
});
test('disposing registry closes an authenticated transport with pending reads',{timeout:6000},async t=>{
 const {server,registry,owner,settings}=await setup(t,{holdRequests:true});
 const approval=await registry.beginProbe(owner,settings).review;
 const metadata=await registry.connect(owner,{...approval,approved:true,credentials});
 const connection=registry.getConnection(owner,metadata.connectionId);
 const rejected=assert.rejects(connection.request('stat',['/fixture/file']));
 await until(()=>server.events.requests.length>0);
 await registry.disposeSession(owner);await rejected;await until(()=>server.clients.size===0);
 assert.equal(connection.closed,true);
});
