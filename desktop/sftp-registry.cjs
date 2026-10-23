'use strict';
const {randomUUID}=require('node:crypto');
const {isIP}=require('node:net');
const {domainToASCII}=require('node:url');
const transport=require('./sftp-connection.cjs');
const messages=Object.freeze({INVALID_OPTIONS:'Invalid SFTP connection settings.',SESSION_CLOSED:'SFTP session is closed.',NOT_FOUND:'SFTP authority is unavailable.',ABORT_ERR:'SFTP connection cancelled.',TRUST_EXPIRED:'SSH host-key review expired. Probe again.',TRUST_REQUIRED:'Review and approve this SSH host key before connecting.',HOST_KEY_UNTRUSTED:'The SSH host key changed. Probe and review again.',AUTH_FAILED:'SFTP authentication failed.',ETIMEDOUT:'SFTP connection timed out.',CONNECTION_FAILED:'SFTP connection failed.',CONNECTION_CLOSED:'SFTP connection closed.',LIMIT_REACHED:'Too many SFTP connections or attempts.',KNOWN_HOST_CHANGED:'Saved SSH host key changed. Probe and review again.',KNOWN_HOST_INVALID:'Invalid saved SSH host key.',KNOWN_HOST_STORE_INVALID:'Saved SSH host keys could not be read safely.',KNOWN_HOST_STORE_IO:'Saved SSH host keys are unavailable.',KNOWN_HOST_LIMIT:'Too many saved SSH host keys.'});
const fail=code=>Object.assign(new Error(messages[code]||messages.CONNECTION_FAILED),{code:messages[code]?code:'CONNECTION_FAILED'});
const safeError=error=>fail(Object.hasOwn(messages,error?.code)?error.code:'CONNECTION_FAILED');
const fingerprintValid=value=>typeof value==='string'&&/^SHA256:[A-Za-z0-9+/]{43}$/.test(value);
function settings(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['host','port','connectTimeoutMs','requestTimeoutMs'].includes(key)))throw fail('INVALID_OPTIONS');
 let host=value.host;const port=value.port??22;
 if(typeof host!=='string')throw fail('INVALID_OPTIONS');
 host=host.trim().toLowerCase();if(/[\s\x00-\x1f\x7f/\\@?#]/.test(host))throw fail('INVALID_OPTIONS');if(host.startsWith('[')&&host.endsWith(']'))host=host.slice(1,-1);
 if(!isIP(host)){host=domainToASCII(host.replace(/\.$/,''));if(!host||!host.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))throw fail('INVALID_OPTIONS');}
 if(!host||host.length>253||!Number.isInteger(port)||port<1||port>65535)throw fail('INVALID_OPTIONS');
 const result={host,port};for(const key of ['connectTimeoutMs','requestTimeoutMs'])if(value[key]!==undefined){if(!Number.isInteger(value[key])||value[key]<1||value[key]>300000)throw fail('INVALID_OPTIONS');result[key]=value[key];}
 return Object.freeze(result);
}
function credentials(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['username','password','privateKey','passphrase'].includes(key))||typeof value.username!=='string'||!value.username||value.username.length>256||/[\x00-\x1f\x7f]/.test(value.username))throw fail('INVALID_OPTIONS');
 if((value.password!==undefined)===(value.privateKey!==undefined)||value.password!==undefined&&typeof value.password!=='string'||value.privateKey!==undefined&&typeof value.privateKey!=='string'&&!Buffer.isBuffer(value.privateKey)||value.passphrase!==undefined&&typeof value.passphrase!=='string')throw fail('INVALID_OPTIONS');
 return {username:value.username,...(value.privateKey!==undefined?{privateKey:value.privateKey,...(value.passphrase!==undefined?{passphrase:value.passphrase}:{})}:{password:value.password})};
}
/** Native-only authority; never send this instance or getConnection() to a renderer.
 * owner must be a stable native object per session, NOT a replaceable snapshot or
 * a renderer-provided ID. Allocate it in the trusted IPC/session adapter.
 * beginProbe(owner, {host,port,...timeouts}, {slot='default'}) returns
 * {attemptId, review: Promise<{attemptId,host,port,fingerprint,previousFingerprint,
 * keyChanged,approvalToken,expiresAt}>}. It accepts NO credentials. A newer probe
 * in the same slot supersedes a pending attempt, leaving ready connections intact.
 * After explicit review, connect(owner,{attemptId,approvalToken,approved:true,
 * credentials:{username,password|privateKey,passphrase?},rememberHost?:boolean})
 * consumes the token once. forgetHost(owner,{attemptId,approvalToken}) consumes
 * a reviewed saved fingerprint to forget it with compare-and-swap protection.
 * IDs/tokens are opaque; token binding lives only in native attempt state.
 * list returns safe metadata, cancel aborts pending work. Native retainConnection
 * delegates a fresh handle to another owner without copying credentials.
 * disconnect/disposeSession release owned references; the final release closes
 * the transport. Transport failure/cancellation still affects every reference.
 * disposeSession revokes authority immediately and awaits its cleanup.
 * Session pins are forgotten on disposal. An optional native knownHosts store
 * supplies saved fingerprints; EVERY connect still needs explicit review.
 * rememberHost opts into saving only after a verified connection, using CAS.
 * Injected probe/connect must honor AbortSignal and settle only after cleanup;
 * connect must enforce expectedFingerprint before sending authentication.
 */
class SftpRegistry {
 #sessions=new WeakMap();#disposed=new WeakSet();#probe;#connect;#now;#ttl;#knownHosts;
 constructor({probe=transport.probeSftpHostKey,connect=transport.connectSftp,now=Date.now,reviewLifetimeMs=60000,knownHosts=null}={}){
  if(typeof probe!=='function'||typeof connect!=='function'||typeof now!=='function'||!Number.isInteger(reviewLifetimeMs)||reviewLifetimeMs<1||reviewLifetimeMs>300000)throw fail('INVALID_OPTIONS');
  if(knownHosts!==null&&(!knownHosts||typeof knownHosts.lookup!=='function'||typeof knownHosts.remember!=='function'))throw fail('INVALID_OPTIONS');
  this.#knownHosts=knownHosts;this.#probe=probe;this.#connect=connect;this.#now=now;this.#ttl=reviewLifetimeMs;
 }
 #session(owner){
  if(!owner||typeof owner!=='object')throw fail('INVALID_OPTIONS');if(this.#disposed.has(owner))throw fail('SESSION_CLOSED');
  let session=this.#sessions.get(owner);if(!session){session={attempts:new Map(),connections:new Map(),pins:new Map(),jobs:new Set(),disposed:false};this.#sessions.set(owner,session);}return session;
 }
 #revoke(session,attempt,code='ABORT_ERR'){
  if(!attempt)return;attempt.reason=code;clearTimeout(attempt.timer);attempt.token=null;session.attempts.delete(attempt.id);attempt.controller.abort();
 }
 #current(session,attempt){if(session.disposed||session.attempts.get(attempt.id)!==attempt||attempt.controller.signal.aborted)throw fail(attempt.reason||'ABORT_ERR');}
 #track(session,job){session.jobs.add(job);job.then(()=>session.jobs.delete(job),()=>session.jobs.delete(job));return job;}
 beginProbe(owner,config,{slot='default'}={}){
  const session=this.#session(owner),normalized=settings(config);
  if(typeof slot!=='string'||!slot||slot.length>128)throw fail('INVALID_OPTIONS');
  for(const old of session.attempts.values())if(old.slot===slot)this.#revoke(session,old);
  if(session.attempts.size+session.connections.size>=32)throw fail('LIMIT_REACHED');
  const attempt={id:randomUUID(),slot,settings:normalized,controller:new AbortController(),state:'probing',token:null};session.attempts.set(attempt.id,attempt);
  const review=this.#track(session,Promise.resolve().then(async()=>{
   try{
    this.#current(session,attempt);const fingerprint=await this.#probe({...normalized,signal:attempt.controller.signal});this.#current(session,attempt);
    if(!fingerprintValid(fingerprint))throw fail('CONNECTION_FAILED');
    attempt.savedFingerprint=this.#knownHosts?await this.#knownHosts.lookup({host:normalized.host,port:normalized.port}):null;
    this.#current(session,attempt);
    if(attempt.savedFingerprint!==null&&!fingerprintValid(attempt.savedFingerprint))throw fail('KNOWN_HOST_STORE_INVALID');
    attempt.fingerprint=fingerprint;attempt.token=randomUUID();attempt.expiresAt=this.#now()+this.#ttl;attempt.state='review';
    attempt.timer=setTimeout(()=>this.#revoke(session,attempt,'TRUST_EXPIRED'),this.#ttl);attempt.timer.unref?.();
    const previousFingerprint=attempt.savedFingerprint??session.pins.get(JSON.stringify([normalized.host,normalized.port]))??null;
    return Object.freeze({attemptId:attempt.id,host:normalized.host,port:normalized.port,fingerprint,savedFingerprint:attempt.savedFingerprint,knownHost:attempt.savedFingerprint===fingerprint,rememberSupported:this.#knownHosts!==null,previousFingerprint,keyChanged:previousFingerprint!==null&&previousFingerprint!==fingerprint,approvalToken:attempt.token,expiresAt:attempt.expiresAt});
   }catch(error){const code=attempt.reason;this.#revoke(session,attempt,code||'CONNECTION_FAILED');throw code?fail(code):safeError(error);}
  }));return Object.freeze({attemptId:attempt.id,review});
 }
 connect(owner,{attemptId,approvalToken,approved,credentials:provided,rememberHost=false}={}){
  const session=this.#session(owner),attempt=session.attempts.get(attemptId);
  if(!attempt)throw fail('NOT_FOUND');this.#current(session,attempt);
  if(attempt.state!=='review'||approved!==true||typeof approvalToken!=='string'||approvalToken!==attempt.token)throw fail('TRUST_REQUIRED');
  if(this.#now()>=attempt.expiresAt){this.#revoke(session,attempt,'TRUST_EXPIRED');throw fail('TRUST_EXPIRED');}
  if(typeof rememberHost!=='boolean')throw fail('INVALID_OPTIONS');
  if(rememberHost&&!this.#knownHosts)throw fail('KNOWN_HOST_STORE_IO');
  const auth=credentials(provided),username=auth.username;attempt.token=null;clearTimeout(attempt.timer);attempt.state='connecting';
  const job=Promise.resolve().then(async()=>{
   let connection;
   try{
    this.#current(session,attempt);
    if(rememberHost){
     const saved=await this.#knownHosts.lookup({host:attempt.settings.host,port:attempt.settings.port});this.#current(session,attempt);
     if(saved!==attempt.savedFingerprint)throw fail('KNOWN_HOST_CHANGED');
    }
    connection=await this.#connect({...attempt.settings,...auth,expectedFingerprint:attempt.fingerprint,signal:attempt.controller.signal});
    // Do not retain credentials through cleanup or expose transport error text.
    for(const key of Object.keys(auth))delete auth[key];
    this.#current(session,attempt);
    if(!connection||typeof connection.close!=='function'||typeof connection.request!=='function'||connection.closed)throw fail('CONNECTION_FAILED');
    if(connection.fingerprint!==attempt.fingerprint)throw fail('HOST_KEY_UNTRUSTED');
    if(rememberHost){
     await this.#knownHosts.remember({host:attempt.settings.host,port:attempt.settings.port},attempt.fingerprint,attempt.savedFingerprint,{current:()=>this.#current(session,attempt)});
     this.#current(session,attempt);
     if(connection.closed)throw fail('CONNECTION_CLOSED');
    }
    const connectionId=randomUUID(),metadata=Object.freeze({connectionId,host:attempt.settings.host,port:attempt.settings.port,username,fingerprint:attempt.fingerprint});
    session.connections.set(connectionId,{connection,metadata,lease:{connection,references:1}});session.pins.set(JSON.stringify([metadata.host,metadata.port]),metadata.fingerprint);session.attempts.delete(attempt.id);return metadata;
   }catch(error){if(connection)try{await connection.close();}catch{}const code=attempt.reason;this.#revoke(session,attempt,code||'CONNECTION_FAILED');throw code?fail(code):safeError(error);}
   finally{for(const key of Object.keys(auth))delete auth[key];}
  });return this.#track(session,job);
 }
 // Forgetting is a native trust mutation bound to exactly the saved key shown
 // in a fresh review. Consuming this token requires a new probe before sign-in.
 forgetHost(owner,{attemptId,approvalToken}={}){
  const session=this.#session(owner),attempt=session.attempts.get(attemptId);
  if(!attempt)throw fail('NOT_FOUND');this.#current(session,attempt);
  if(attempt.state!=='review'||typeof approvalToken!=='string'||approvalToken!==attempt.token)throw fail('TRUST_REQUIRED');
  if(this.#now()>=attempt.expiresAt){this.#revoke(session,attempt,'TRUST_EXPIRED');throw fail('TRUST_EXPIRED');}
  if(!this.#knownHosts||typeof this.#knownHosts.forget!=='function')throw fail('KNOWN_HOST_STORE_IO');
  if(attempt.savedFingerprint===null)throw fail('KNOWN_HOST_INVALID');
  attempt.token=null;clearTimeout(attempt.timer);attempt.state='forgetting';
  const job=Promise.resolve().then(async()=>{
   try{
    this.#current(session,attempt);
    await this.#knownHosts.forget({host:attempt.settings.host,port:attempt.settings.port},attempt.savedFingerprint,{current:()=>this.#current(session,attempt)});
    this.#current(session,attempt);this.#revoke(session,attempt);
    return Object.freeze({forgotten:true});
   }catch(error){const code=attempt.reason;this.#revoke(session,attempt,code||'CONNECTION_FAILED');throw code?fail(code):safeError(error);}
  });
  return this.#track(session,job);
 }
 cancel(owner,attemptId){const session=this.#session(owner),attempt=session.attempts.get(attemptId);if(!attempt)return false;this.#revoke(session,attempt);return true;}
 list(owner){const session=this.#session(owner);return {attempts:[...session.attempts.values()].map(a=>({attemptId:a.id,host:a.settings.host,port:a.settings.port,state:a.state})),connections:[...session.connections.values()].map(({connection,metadata})=>({...metadata,closed:!!connection.closed}))};}
 getConnection(owner,connectionId){const entry=this.#session(owner).connections.get(connectionId);if(!entry)throw fail('NOT_FOUND');if(entry.connection.closed)throw fail('CONNECTION_CLOSED');return entry.connection;}
 // Native-only delegation: callers must already hold both stable owner objects.
 // Each owner gets a new opaque handle; no credentials or review tokens transfer.
 retainConnection(sourceOwner,connectionId,targetOwner){
  const source=this.#session(sourceOwner),entry=source.connections.get(connectionId);
  if(!entry)throw fail('NOT_FOUND');if(entry.connection.closed)throw fail('CONNECTION_CLOSED');
  const target=this.#session(targetOwner);
  if(target.attempts.size+target.connections.size>=32)throw fail('LIMIT_REACHED');
  const metadata=Object.freeze({...entry.metadata,connectionId:randomUUID()});
  entry.lease.references++;target.connections.set(metadata.connectionId,{connection:entry.connection,metadata,lease:entry.lease});
  target.pins.set(JSON.stringify([metadata.host,metadata.port]),metadata.fingerprint);
  return metadata;
 }
 #release(entry){
  if(--entry.lease.references>0)return Promise.resolve();
  return Promise.resolve().then(()=>entry.connection.close());
 }
 disconnect(owner,connectionId){const session=this.#session(owner),entry=session.connections.get(connectionId);if(!entry)return Promise.resolve(false);session.connections.delete(connectionId);return this.#track(session,this.#release(entry).then(()=>true,error=>{throw safeError(error);}));}
 disposeSession(owner){
  if(!owner||typeof owner!=='object')throw fail('INVALID_OPTIONS');const session=this.#sessions.get(owner);this.#disposed.add(owner);if(!session)return Promise.resolve();if(session.disposal)return session.disposal;
  session.disposed=true;for(const attempt of session.attempts.values())this.#revoke(session,attempt);
  const closing=[...session.connections.values()].map(entry=>this.#release(entry));session.connections.clear();session.pins.clear();
  session.disposal=Promise.allSettled([...session.jobs,...closing]).then(()=>{});return session.disposal;
 }
}
module.exports={SftpRegistry};
