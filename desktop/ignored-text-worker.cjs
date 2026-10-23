'use strict';
const {parentPort}=require('node:worker_threads');
const {prepareComparisonKeys}=require('../src/text-comparison-keys.cjs');
const {normalizeIgnoredText}=require('../src/ignored-text-normalize.cjs');
parentPort.on('message',({id,texts,patterns,profile,structured,grammar})=>{try{parentPort.postMessage({id,result:structured?prepareComparisonKeys(texts,patterns,profile,grammar):normalizeIgnoredText(texts,patterns)});}catch(error){parentPort.postMessage({id,error:error.message});}});
parentPort.postMessage({ready:true});
