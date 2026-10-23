'use strict';
const {Worker}=require('node:worker_threads');
const path=require('node:path');
const {runDocWorker}=require('./doc-worker-client.cjs');
function extractDocTextInNode(bytes,{scope='main-document',signal}={}){
 return runDocWorker(bytes,{scope,signal,createWorker:()=>new Worker(path.join(__dirname,'doc-text-node-worker.cjs'),{execArgv:[],resourceLimits:{maxOldGenerationSizeMb:192,maxYoungGenerationSizeMb:32,stackSizeMb:4}})});
}
module.exports={extractDocTextInNode};
