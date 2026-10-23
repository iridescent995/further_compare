'use strict';
const {parentPort}=require('node:worker_threads');
const {inspectTextPatch,applyTextPatch}=require('../src/text-patch-apply.cjs');
parentPort.on('message',({operation,value})=>{try{if(!['inspect','apply'].includes(operation))throw Error('Unknown patch worker operation.');parentPort.postMessage({result:operation==='inspect'?inspectTextPatch(value.patch):applyTextPatch(value)});}catch(error){parentPort.postMessage({error:error.message});}});
