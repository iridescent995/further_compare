'use strict';
const {parentPort}=require('node:worker_threads');
const {handleDocTask}=require('./doc-worker-handler.cjs');
parentPort.once('message',data=>{parentPort.postMessage(handleDocTask(data));parentPort.close();});
