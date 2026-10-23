'use strict';
const path=require('node:path'),{pathToFileURL,fileURLToPath}=require('node:url'),{randomUUID}=require('node:crypto');
const {validateDocumentProjection}=require('../src/document-projection.cjs');
const failure=(code,message)=>Object.assign(Error(message),{code});
const MAX_INPUT=32*1024*1024,MAX_OUTPUT=8*1024*1024,TIMEOUT=30000,MAX_QUEUE=4;
function createPdfTextService({app,BrowserWindow,ipcMain,assetRoot}){
 if(!path.isAbsolute(assetRoot||''))throw Error('PDF asset root must be absolute.');
 const root=path.resolve(assetRoot),entry=path.join(root,'entry.html'),entryURL=pathToFileURL(entry).href,partition='pdf-text-'+randomUUID();
 let disposed=false,active=null,configured=false;const queue=[];
 function allowed(url){try{const parsed=new URL(url);if(parsed.protocol!=='file:'||parsed.search||parsed.hash)return false;const relative=path.relative(root,fileURLToPath(parsed));return ['entry.html','entry.js','pdf.mjs','pdf.worker.mjs'].includes(relative)||/^cmaps\/[A-Za-z0-9_.-]+\.bcmap$/.test(relative.split(path.sep).join('/'))||/^standard_fonts\/[A-Za-z0-9_.-]+\.(?:pfb|ttf)$/.test(relative.split(path.sep).join('/'));}catch{return false;}}
 function validEvent(event){return active?.window&&!active.window.isDestroyed()&&event.sender===active.window.webContents&&event.senderFrame===event.sender.mainFrame;}
 function ready(event){if(!validEvent(event)||active.sent)return;active.sent=true;event.sender.send('pdf-text:input',{bytes:active.bytes,order:active.order});active.bytes=null;}
 function result(event,message){if(!validEvent(event)||!active.sent)return;const job=active;try{
  if(message?.ok!==true)throw failure(/^DOCUMENT_(?:ORDER_UNSUPPORTED|ENGINE_UNAVAILABLE|PASSWORD_REQUIRED|NO_TEXT|INVALID|LIMIT|RESOURCE|TIMEOUT|CANCELLED)$/.test(message?.code)?message.code:'DOCUMENT_INVALID',typeof message?.error==='string'?message.error.slice(0,1024):'PDF extraction failed.');
  const value=message.result;if(typeof value?.content!=='string'||!value.content.trim()||Buffer.byteLength(value.content,'utf8')>MAX_OUTPUT)throw Error('Invalid PDF extracted text.');
  const projection=validateDocumentProjection(value.projection);if(projection.kind!=='pdf'||(projection.order||'document')!==job.order)throw Error('Invalid PDF extraction metadata.');
  finish(job,null,{content:value.content,projection});
 }catch(error){finish(job,error);}}
 function finish(job,error,value){if(job.done)return;job.done=true;clearTimeout(job.timer);job.signal?.removeEventListener('abort',job.abort);job.bytes=null;const index=queue.indexOf(job);if(index>=0)queue.splice(index,1);if(active===job)active=null;if(job.window&&!job.window.isDestroyed())job.window.destroy();error?job.reject(error):job.resolve(value);queueMicrotask(pump);}
 async function pump(){if(disposed||active||!queue.length)return;const job=queue.shift();active=job;job.timer=setTimeout(()=>finish(job,failure('DOCUMENT_TIMEOUT','PDF extraction timed out.')),TIMEOUT);
 try{await app.whenReady();if(job.done||disposed)return;
  const w=job.window=new BrowserWindow({show:false,webPreferences:{preload:path.join(__dirname,'pdf-text-preload.cjs'),sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false,partition}});
  if(!configured){configured=true;const session=w.webContents.session;session.setPermissionRequestHandler((_wc,_permission,reply)=>reply(false));session.setPermissionCheckHandler(()=>false);session.webRequest.onBeforeRequest((details,reply)=>reply({cancel:!allowed(details.url)}));}
  w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',event=>event.preventDefault());w.webContents.on('will-attach-webview',event=>event.preventDefault());
  w.webContents.on('render-process-gone',()=>finish(job,failure('DOCUMENT_INVALID','PDF extraction process stopped unexpectedly.')));w.on('closed',()=>finish(job,failure('DOCUMENT_CANCELLED','PDF extraction window closed.')));
  await w.loadURL(entryURL);
 }catch(error){finish(job,error);}}
 ipcMain.on('pdf-text:ready',ready);ipcMain.on('pdf-text:result',result);
 function dispose(){if(disposed)return;disposed=true;ipcMain.removeListener('pdf-text:ready',ready);ipcMain.removeListener('pdf-text:result',result);app.removeListener('will-quit',dispose);for(const job of [...queue,active].filter(Boolean))finish(job,failure('DOCUMENT_CANCELLED','PDF extraction service closed.'));}
 app.on('will-quit',dispose);
 return Object.freeze({extract(bytes,{signal,order='document'}={}){return new Promise((resolve,reject)=>{
  if(!['document','page-rows','page-columns','tagged-structure'].includes(order))return reject(failure('DOCUMENT_INVALID','Invalid PDF ordering policy.'));
  if(disposed)return reject(failure('DOCUMENT_CANCELLED','PDF extraction service closed.'));if(!(bytes instanceof Uint8Array)||!bytes.byteLength||bytes.byteLength>MAX_INPUT)return reject(failure('DOCUMENT_LIMIT','PDF input must be between 1 byte and 32 MiB.'));if(signal?.aborted)return reject(failure('DOCUMENT_CANCELLED','PDF extraction cancelled.'));if(queue.length>=MAX_QUEUE)return reject(failure('DOCUMENT_LIMIT','PDF extraction queue is full.'));
  const job={bytes:new Uint8Array(bytes),order,signal,resolve,reject,done:false,sent:false};job.abort=()=>finish(job,failure('DOCUMENT_CANCELLED','PDF extraction cancelled.'));signal?.addEventListener('abort',job.abort,{once:true});queue.push(job);pump();
 });},dispose});
}
module.exports={createPdfTextService};
