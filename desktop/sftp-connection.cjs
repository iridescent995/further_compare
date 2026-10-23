'use strict';
const {createHash}=require('node:crypto');
const {Client}=require('ssh2');
const {Socket}=require('node:net');
const METHODS=new Set(['realpath','lstat','stat','fstat','opendir','readdir','open','read','close','write','rename','unlink','mkdir','rmdir','setstat','fsetstat','readlink','ext_openssh_rename','ext_openssh_fsync']);
const failure=(code,message)=>Object.assign(new Error(message),{code});
function hostFingerprint(key){if(!Buffer.isBuffer(key)||!key.length)throw failure('HOST_KEY_INVALID','Invalid SSH host key.');return 'SHA256:'+createHash('sha256').update(key).digest('base64').replace(/=+$/,'');}
function deadline(value,fallback){value??=fallback;if(!Number.isInteger(value)||value<1||value>300000)throw failure('INVALID_OPTIONS','Choose a timeout between 1 and 300000 milliseconds.');return value;}
function signalValid(signal){if(signal!==undefined&&(!signal||typeof signal.addEventListener!=='function'||typeof signal.removeEventListener!=='function'||typeof signal.aborted!=='boolean'))throw failure('INVALID_OPTIONS','Invalid cancellation signal.');}
function validateOptions(value,probe){
 if(!value||typeof value!=='object'||Array.isArray(value))throw failure('INVALID_OPTIONS','Choose SFTP connection settings.');
 const {host,port=22,username,expectedFingerprint,signal}=value;
 if(typeof host!=='string'||!host.trim()||host.length>253||/[\s\x00-\x1f\x7f/\\]/.test(host)||!Number.isInteger(port)||port<1||port>65535||(!probe&&(typeof username!=='string'||!username||username.length>256||/[\x00-\x1f\x7f]/.test(username))))throw failure('INVALID_OPTIONS','Invalid SFTP host, port or username.');
 if(expectedFingerprint!==undefined&&(typeof expectedFingerprint!=='string'||!/^SHA256:[A-Za-z0-9+/]{43}$/.test(expectedFingerprint)))throw failure('INVALID_OPTIONS','Invalid trusted host-key fingerprint.');
 if(value.password!==undefined&&typeof value.password!=='string'||value.privateKey!==undefined&&typeof value.privateKey!=='string'&&!Buffer.isBuffer(value.privateKey)||value.passphrase!==undefined&&typeof value.passphrase!=='string')throw failure('INVALID_OPTIONS','Invalid SFTP credentials.');
 if(!probe&&value.password!==undefined&&value.privateKey!==undefined)throw failure('INVALID_OPTIONS','Choose password or private-key authentication.');
 signalValid(signal);
 return {host,port,username:probe?'host-key-probe':username,expectedFingerprint,signal,connectTimeoutMs:deadline(value.connectTimeoutMs,10000),requestTimeoutMs:deadline(value.requestTimeoutMs,10000)};
}
// Credentials are used only by this native client. No shell channel, agent,
// forwarding, debug logger or persistence API is exposed.
// ssh2 1.17.0 keeps negotiated extension versions in this native-only map.
function negotiatedCapabilities(channel){return Object.freeze({atomicRename:channel._extensions?.['posix-rename@openssh.com']==='1',fsync:channel._extensions?.['fsync@openssh.com']==='1'});}
function establish(value,probe){
 let options;try{options=validateOptions(value,probe);}catch(error){return Promise.reject(error);}
 if(options.signal?.aborted)return Promise.reject(failure('ABORT_ERR','SFTP connection cancelled.'));
 return new Promise((resolve,reject)=>{
  const client=new Client(),socket=new Socket(),pending=new Set();
  socket.on('error',()=>{});let sftp=null,fingerprint=null,closed=false,finished=false,connected=false,reason=null,closeTimer=null,connectTimer=null,resolveClosed;
  const closedPromise=new Promise(done=>{resolveClosed=done;});
  const detachConnect=()=>{clearTimeout(connectTimer);options.signal?.removeEventListener('abort',abortConnect);};
  const drain=()=>{
   if(finished)return;finished=true;closed=true;detachConnect();clearTimeout(closeTimer);
   const error=reason||failure('CONNECTION_CLOSED','SFTP connection closed.');
   for(const job of [...pending])job.fail(error);
   if(!connected){if(probe&&fingerprint&&reason?.code==='HOST_KEY_PROBED')resolve(fingerprint);else reject(error);}
   resolveClosed();
  };
  const shutdown=error=>{
   if(closed)return closedPromise;closed=true;reason=error||failure('CONNECTION_CLOSED','SFTP connection closed.');detachConnect();
   // destroy closes channels and handles remotely too; no detached request may
   // continue after cancellation. Reconnect is required after abort/deadline.
   closeTimer=setTimeout(drain,500);try{socket.destroy();client.destroy();}catch{drain();}return closedPromise;
  };
  const abortConnect=()=>{void shutdown(failure('ABORT_ERR','SFTP connection cancelled.'));};
  client.on('error',error=>{void shutdown(reason||failure(error?.level==='client-authentication'?'AUTH_FAILED':'CONNECTION_FAILED',error?.level==='client-authentication'?'SFTP authentication failed.':'SFTP connection failed.'));});
  client.on('close',()=>{if(!closed){closed=true;reason??=failure('CONNECTION_CLOSED','SFTP connection closed.');}drain();});
  client.on('end',()=>{void shutdown(failure('CONNECTION_CLOSED','SFTP connection closed.'));});
  client.on('ready',()=>{
   if(closed)return;
   client.sftp((error,channel)=>{
    if(closed){channel?.destroy();return;}
    if(error){void shutdown(failure('SFTP_UNAVAILABLE','The server could not open SFTP.'));return;}
    sftp=channel;const capabilities=negotiatedCapabilities(channel);
    sftp.on('error',()=>{void shutdown(failure('SFTP_FAILED','SFTP channel failed.'));});
    sftp.on('close',()=>{void shutdown(failure('CONNECTION_CLOSED','SFTP channel closed.'));});
    connected=true;detachConnect();
    resolve(Object.freeze({fingerprint,capabilities,host:options.host,port:options.port,get closed(){return closed;},close:()=>shutdown(),
     request(method,args=[],requestOptions={}){
      if(closed)return Promise.reject(reason||failure('CONNECTION_CLOSED','SFTP connection closed.'));
      let timeoutMs;try{if(!METHODS.has(method)||!Array.isArray(args)||args.some(arg=>typeof arg==='function'))throw failure('INVALID_REQUEST','Unsupported SFTP request.');if(method==='ext_openssh_rename'&&!capabilities.atomicRename||method==='ext_openssh_fsync'&&!capabilities.fsync)throw failure('UNSUPPORTED_CAPABILITY','The server does not support this SFTP operation.');signalValid(requestOptions.signal);timeoutMs=deadline(requestOptions.timeoutMs,options.requestTimeoutMs);}catch(error){return Promise.reject(error);}
      const signal=requestOptions.signal;
      return new Promise((done,fail)=>{
       let settled=false,timer;
       const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);pending.delete(job);};
       const job={fail:error=>{if(settled)return;settled=true;cleanup();fail(error);}};
       const abort=()=>{void shutdown(failure('ABORT_ERR','SFTP request cancelled.'));};
       pending.add(job);signal?.addEventListener('abort',abort,{once:true});
       timer=setTimeout(()=>{void shutdown(failure('ETIMEDOUT','SFTP request timed out.'));},timeoutMs);
       if(signal?.aborted){abort();return;}
       try{sftp[method](...args,(error,...values)=>{
        if(settled||closed)return;
        if(error){const code=Number.isInteger(error.code)?error.code:'SFTP_REQUEST_FAILED';job.fail(failure(code,'SFTP request failed.'));return;}
        settled=true;cleanup();done(values);
       });}catch{job.fail(failure('INVALID_REQUEST','Invalid SFTP request.'));}
      });
     }
    }));
   });
  });
  options.signal?.addEventListener('abort',abortConnect,{once:true});
  connectTimer=setTimeout(()=>{void shutdown(failure('ETIMEDOUT','SFTP connection timed out.'));},options.connectTimeoutMs);
  try{socket.connect({host:options.host,port:options.port});client.connect({sock:socket,host:options.host,port:options.port,username:options.username,readyTimeout:options.connectTimeoutMs,tryKeyboard:false,authHandler:probe?[]:value.privateKey!==undefined?['publickey']:['password'],...(probe?{}:value.privateKey!==undefined?{privateKey:value.privateKey,...(value.passphrase!==undefined?{passphrase:value.passphrase}:{})}:{password:value.password??''}),hostVerifier:key=>{
   if(closed)return false;
   fingerprint=hostFingerprint(key);
   if(probe){reason=failure('HOST_KEY_PROBED','SSH host key observed.');return false;}
   if(!options.expectedFingerprint||fingerprint!==options.expectedFingerprint){reason=Object.assign(failure('HOST_KEY_UNTRUSTED','Review and approve the SSH host key before connecting.'),{fingerprint});return false;}
   return true;
  }});}catch{void shutdown(failure('CONNECTION_FAILED','SFTP connection could not start.'));}
 });
}
const connectSftp=options=>establish(options,false);
const probeSftpHostKey=options=>establish(options,true);
module.exports={connectSftp,probeSftpHostKey,hostFingerprint};
