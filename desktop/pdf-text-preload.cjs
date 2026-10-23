'use strict';
const {contextBridge,ipcRenderer}=require('electron');
let received=false,finished=false;
contextBridge.exposeInMainWorld('pdfExtraction',Object.freeze({
 receive(callback){if(received||typeof callback!=='function')throw Error('PDF receiver already registered.');received=true;ipcRenderer.once('pdf-text:input',(_event,request)=>{if(!request||!(request.bytes instanceof Uint8Array)||!request.bytes.length||request.bytes.length>32*1024*1024||!['document','page-rows','page-columns','tagged-structure'].includes(request.order))throw Error('Invalid PDF request.');callback({bytes:request.bytes,order:request.order});});ipcRenderer.send('pdf-text:ready');},
 finish(message){if(finished)return;finished=true;ipcRenderer.send('pdf-text:result',message);}
}));
