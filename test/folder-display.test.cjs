'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {FOLDER_FILTER_IDS,matchesFolderStatus}=require('../desktop/folder-display.cjs');
const pair=(status,a,b)=>({kindA:'file',kindB:'file',status,mtimeA:a,mtimeB:b});
test('folder display filters distinguish pairing, content and timestamp criteria',()=>{
 const rows=[pair('equal',20,10),pair('changed',10,20),pair('changed',10,10),pair('equal',10,10),{kindA:'file',kindB:null,status:'left'},{kindA:null,kindB:'directory',status:'right'},{kindA:'directory',kindB:'file',status:'conflict'}];
 const expected={left:[4],right:[5],paired:[0,1,2,3,6],'paired-diff':[1,2,6],'one-sided':[4,5],'newer-left':[0],'newer-right':[1],'newer-left-or-only':[0,4],'newer-right-or-only':[1,5]};
 for(const key of FOLDER_FILTER_IDS)assert.deepEqual(rows.flatMap((row,i)=>matchesFolderStatus(row,key)?[i]:[]),expected[key],key);
 for(const time of [null,undefined,NaN,Infinity,'100'])assert.equal(matchesFolderStatus(pair('changed',time,1),'newer-left'),false);
 assert.equal(matchesFolderStatus(pair('changed',1,2),'unknown'),false);
});
