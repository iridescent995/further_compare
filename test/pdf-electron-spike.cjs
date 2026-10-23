'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{_electron:electron}=require('@playwright/test'),{fixture}=require('./pdf-spike-fixtures.cjs');
const engine=process.env.FC_PDF_SPIKE_ROOT||'/private/tmp/fc-pdf-engine-spike';
function graphicFixture(columns){
 const stream=columns?'BT /F1 12 Tf 60 700 Td (Left top) Tj 0 -20 Td (Left bottom) Tj 250 20 Td (Right top) Tj 0 -20 Td (Right bottom) Tj ET':'q 100 0 0 100 40 600 cm /Im0 Do Q';
 const raw=columns?'':'\xff\x00\x00';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 1 /Kids [3 0 R] >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> /XObject << /Im0 6 0 R >> >> /Contents 4 0 R >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${raw.length} >>\nstream\n${raw}\nendstream`];let text='%PDF-1.7\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(text,'latin1'));text+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const start=Buffer.byteLength(text,'latin1');text+=`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;return [...Buffer.from(text,'latin1')];
}
(async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-pdf-electron-'));let app;try{
 const html=path.join(root,'extract.html'),main=path.join(root,'main.cjs');
 await fs.writeFile(html,`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' file:; worker-src 'self' file:; connect-src 'none'"><title>Isolated PDF extraction</title>`);
 const servicePrefix=`
const {app,BrowserWindow,session}=require('electron');const path=require('node:path');const {pathToFileURL}=require('node:url');
app.setPath('userData',${JSON.stringify(path.join(root,'profile'))});let serial=0;app.on('window-all-closed',()=>{});
app.whenReady().then(()=>{global.runPDF=async(bytes,limits={})=>{
 if(bytes.length>(limits.input||32*1024*1024))return {error:'InputLimit',windows:BrowserWindow.getAllWindows().length};
 const partition='pdf-spike-'+(++serial),s=session.fromPartition(partition);s.setPermissionRequestHandler((_w,_p,reply)=>reply(false));s.webRequest.onBeforeRequest((details,reply)=>reply({cancel:!details.url.startsWith(pathToFileURL(${JSON.stringify(path.join(engine,'package'))}+path.sep).href)&&details.url!==pathToFileURL(${JSON.stringify(html)}).href}));
 const w=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false,partition}});w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',event=>event.preventDefault());
`;
 const browserFunction=async function(bytes,limits,moduleURL,workerURL){
  if(limits.spin)while(true){} // test-only deliberately unresponsive renderer
  const pdf=await import(moduleURL);pdf.GlobalWorkerOptions.workerSrc=workerURL;
  const task=pdf.getDocument({data:new Uint8Array(bytes),stopAtErrors:true,isEvalSupported:false,useSystemFonts:false,disableFontFace:true,useWorkerFetch:false,useWasm:false,enableXfa:false,verbosity:0});
  try{const doc=await task.promise;if(doc.numPages>(limits.pages||1000))throw Error('PageLimit');const pages=[];let size=0,items=0;
   for(let index=1;index<=doc.numPages;index++){const page=await doc.getPage(index),reader=page.streamTextContent().getReader();let text='';try{while(true){const chunk=await reader.read();if(chunk.done)break;for(const item of chunk.value.items){if(++items>(limits.items||1000000))throw Error('ItemLimit');if(typeof item.str!=='string')continue;const value=item.str+(item.hasEOL?'\n':'');size+=new TextEncoder().encode(value).length;if(size>(limits.output||8*1024*1024))throw Error('OutputLimit');text+=value;}}}finally{await reader.cancel().catch(()=>{});page.cleanup();}pages.push(text);}
   return {pages,empty:pages.every(text=>!text.trim()),items,bytes:size};
  }finally{await task.destroy();}
 };
 const mainSource=servicePrefix+` let timer,cancel;try{return await Promise.race([(async()=>{await w.loadFile(${JSON.stringify(html)});return await w.webContents.executeJavaScript('('+${JSON.stringify(browserFunction.toString())}+')('+JSON.stringify(bytes)+','+JSON.stringify(limits)+','+JSON.stringify(pathToFileURL(${JSON.stringify(path.join(engine,'package/build/pdf.mjs'))}).href)+','+JSON.stringify(pathToFileURL(${JSON.stringify(path.join(engine,'package/build/pdf.worker.mjs'))}).href)+')');})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('TimeLimit')),limits.time||10000);if(limits.cancelAfter)cancel=setTimeout(()=>reject(Error('Cancelled')),limits.cancelAfter);})]);}catch(error){return {error:error.message};}finally{clearTimeout(timer);clearTimeout(cancel);if(!w.isDestroyed())w.destroy();}\n};});`;
 await fs.writeFile(main,mainSource);const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({args:[main],env});
 const run=(bytes,limits={})=>app.evaluate(async({BrowserWindow},{bytes,limits})=>{const result=await global.runPDF(bytes,limits);return {...result,windows:BrowserWindow.getAllWindows().length};},{bytes,limits});
 const unicode=await run(fixture());assert.deepEqual(unicode.pages,['Ω中🚀','Ω中🚀']);assert.equal(unicode.windows,0);
 const image=await run(graphicFixture(false));assert.equal(image.empty,true);assert.equal(image.windows,0);
 const columns=await run(graphicFixture(true));assert.match(columns.pages[0],/Left top\nLeft bottom\nRight top\nRight bottom/);
 const results={unicode,image,columns};for(const [label,bytes,limits,expected] of [['input',fixture(),{input:1},'InputLimit'],['pages',fixture(),{pages:1},'PageLimit'],['output',fixture(),{output:1},'OutputLimit'],['items',fixture(),{items:1},'ItemLimit'],['timeout',fixture(),{spin:true,time:200},'TimeLimit'],['cancel',fixture(),{spin:true,cancelAfter:200},'Cancelled']]){results[label]=await run(bytes,limits);assert.equal(results[label].error,expected);assert.equal(results[label].windows,0);}
 const after=await run(fixture());assert.deepEqual(after.pages,unicode.pages);console.log(JSON.stringify(results,null,2));console.log('Isolated Electron extraction, bounds, teardown and recovery passed.');
 }finally{if(app)await app.close();await fs.rm(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
