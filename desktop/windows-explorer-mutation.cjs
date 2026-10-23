'use strict';
const path=require('node:path'),fsNative=require('node:fs/promises'),{createHash}=require('node:crypto'),{spawn}=require('node:child_process');
const {planWindowsExplorerLifecycle:plan,snapshotDigest:digest}=require('./windows-explorer-lifecycle.cjs');
const KINDS=new Set(['write-owned-config-values','remove-owned-config-values','register-sparse-package','remove-package']);
const local=value=>typeof value==='string'&&/^[A-Za-z]:\\/.test(value)&&!/[\x00-\x1f"<>|?*/]/.test(value)&&!value.slice(2).includes(':')&&path.win32.normalize(value)===value;
// Fixed command reads trusted script text from stdin. No writable script staging.
function runPowerShell(executable,args,{input,timeout=120000,maxBuffer=8192,spawnProcess=spawn,killGraceMs=1000}){return new Promise((resolve,reject)=>{
 let child,bytes=0,stdout=[],failure=null,closed=false,exited=false,settled=false,killing=false,timer,killTimer;
 const finish=code=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(killTimer);const chunks=stdout;stdout=[];if(failure||code!==0)reject(failure||Error('Native mutation failed; inspection required.'));else resolve({stdout:Buffer.concat(chunks).toString('utf8')});};
 // A descendant may inherit redirected pipes after the command has exited.
 // Failure must not wait indefinitely for that unrelated pipe lifetime. Never
 // publish success early: successful commands still require the close event.
 const finishFailure=()=>{child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();finish(null);};
 const stop=e=>{if(settled)return;failure ||= e;if(exited||closed){finishFailure();return;}if(!child||killing)return;killing=true;killTimer=setTimeout(()=>{failure=Object.assign(Error('Explorer command termination could not be confirmed; restart and inspect before retrying.'),{code:'EXPLORER_TERMINATION_UNCONFIRMED'});child.unref?.();finishFailure();},killGraceMs);try{child.kill('SIGKILL');}catch{};};
 try{child=spawnProcess(executable,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});}catch(e){reject(e);return;}
 timer=setTimeout(()=>stop(Error('Explorer mutation timed out; inspection required.')),timeout);
 child.on('error',stop);child.stdin.on('error',stop);
 child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBuffer)stop(Error('Oversized mutation response.'));else stdout.push(chunk);});
 child.stderr.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBuffer)stop(Error('Oversized mutation diagnostic.'));});
 child.on('exit',code=>{exited=true;if(code!==0)failure ||= Error('Native mutation failed; inspection required.');if(failure)finishFailure();});
 child.on('close',code=>{closed=true;finish(code);});
 child.stdin.end(input);
});}
/** Trusted runner transport, not a UI API. Read-only evidence assessments cannot
 * substitute for authoritative snapshots. Helper hash comes from release config. */
function createWindowsExplorerMutation({inspect,helperSha256,systemRoot='C:\\Windows',platform=process.platform,fs=fsNative,execFile=runPowerShell}={}){
 if(typeof inspect!=='function')throw Error('A trusted fresh inspection is required.');let tail=Promise.resolve(),suspended=false;
 async function perform(step,context){
  if(suspended)throw Error('Explorer mutation disabled after unconfirmed command termination; restart and inspect before retrying.');
  if(platform!=='win32')throw Error('Explorer mutation requires Windows.');
  if(!local(systemRoot)||!KINDS.has(step?.kind)||!context||typeof context.operationId!=='string'||!/^[a-f0-9-]{36}$/i.test(context.operationId))throw Error('Invalid Explorer mutation request.');
  if(typeof helperSha256!=='string'||!/^[a-f0-9]{64}$/.test(helperSha256))throw Error('Trusted release helper pin unavailable; mutation disabled.');
  if(context.bindingDigest!==digest(context.expected))throw Error('Installation binding changed.');
  const snapshot=structuredClone(await inspect(context.expected));
  if(digest(snapshot.expected)!==context.bindingDigest||digest(snapshot)!==context.snapshotDigest)throw Error('Explorer state changed before transport.');
  const permitted=['install','repair','uninstall'].some(action=>{const p=plan(action,snapshot);return p.allowed&&p.steps.filter(s=>KINDS.has(s.kind)).slice(0,1).some(s=>digest(s)===digest(step));});
  if(!permitted)throw Error('Mutation is not the next permitted lifecycle step.');
  const scripts={};for(const name of ['mutation','inspection','attestation']){const bytes=await fs.readFile(path.join(__dirname,'native','explorer-'+name+'.ps1'));if(!bytes.length||bytes.length>65536)throw Error('Invalid packaged native script.');scripts[name]={source:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex')};}
  const nativeGuard={helper:path.win32.join(path.win32.dirname(snapshot.expected.executable),'FurtherComparePackageInspection.exe'),helperSha256,inspection:scripts.inspection,attestation:scripts.attestation};
  const request={version:1,operationId:context.operationId,step,expected:snapshot.expected,observed:snapshot.observed,nativeGuard};
  const bytes=Buffer.from(JSON.stringify(request));if(bytes.length>131072)throw Error('Mutation request exceeds bounds.');
  // Only base64 generated here enters this fixed PowerShell expression. Request
  // content is decoded as JSON by the script, never evaluated as instructions.
  const input="& ([scriptblock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('"+scripts.mutation.source+"')))) -RequestBase64 '"+bytes.toString('base64')+"'\n";
  let result;try{result=await execFile(path.win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command','-'],{input,timeout:120000,windowsHide:true,maxBuffer:8192});}catch(error){if(error?.code==='EXPLORER_TERMINATION_UNCONFIRMED')suspended=true;throw error;}
  let value;try{value=JSON.parse(result.stdout.trim());}catch{throw Error('Mutation response unavailable; fresh inspection required.');}
  if(value?.version!==1||value.ok!==true||value.operationId!==context.operationId||value.kind!==step.kind)throw Error('Mutation response mismatch; fresh inspection required.');
  return {ok:true,activation:'unknown'};
 }
 return Object.freeze({execute(step,context){const s=structuredClone(step),c=structuredClone(context),next=tail.then(()=>perform(s,c));tail=next.catch(()=>{});return next;}});
}
module.exports={createWindowsExplorerMutation,runPowerShell};
