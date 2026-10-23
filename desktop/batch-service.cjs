'use strict';
const {randomUUID}=require('node:crypto');
const {planBatch,runPlannedJobs}=require('../scripts/batch.cjs');
class BatchService{
 #pending=null;#active=null;#extractPdfText;#extractDocText;#signal;
 constructor({extractPdfText,extractDocText,signal}={}){if(extractPdfText!==undefined&&typeof extractPdfText!=='function'||extractDocText!==undefined&&typeof extractDocText!=='function')throw Error('Invalid document extraction adapter.');this.#extractPdfText=extractPdfText;this.#extractDocText=extractDocText;this.#signal=signal;}
 async preview(file){if(this.#active)throw Error('A batch is already running.');this.#signal?.throwIfAborted();this.#pending=null;const jobs=await planBatch(file);this.#signal?.throwIfAborted();const token=randomUUID();this.#pending={file,jobs,token};return {token,jobs:structuredClone(jobs)};}
 cancel(token){if(typeof token!=='string'||this.#active?.token!==token)return false;this.#active.controller.abort();return true;}
 async execute(token,confirm){
  if(this.#active)throw Error('A batch is already running.');
  const pending=this.#pending;if(!pending||typeof token!=='string'||pending.token!==token)throw Error('Choose and review the batch script again.');
  const controller=new AbortController(),signal=this.#signal?AbortSignal.any([controller.signal,this.#signal]):controller.signal;this.#active={token,controller};
  try{
   signal.throwIfAborted();const current=await planBatch(pending.file);signal.throwIfAborted();
   if(JSON.stringify(current)!==JSON.stringify(pending.jobs)){this.#pending=null;throw Error('The batch plan changed. Choose and review it again.');}
   if(!await confirm(pending.jobs.length))return {cancelled:true};signal.throwIfAborted();
   // Confirmation may stay open while the script or report destinations change.
   const confirmed=await planBatch(pending.file);signal.throwIfAborted();
   if(JSON.stringify(confirmed)!==JSON.stringify(pending.jobs)){this.#pending=null;throw Error('The batch plan changed. Choose and review it again.');}
   this.#pending=null;return await runPlannedJobs(pending.jobs,{extractPdfText:this.#extractPdfText,extractDocText:this.#extractDocText,signal});
  }finally{this.#active=null;}
 }
}
module.exports={BatchService};
