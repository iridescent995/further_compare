'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {REFRESH_INTERVALS,validateRefreshInterval,createFolderRefreshSchedule}=require('../src/folder-refresh.cjs');
const {validateDefaultProfile}=require('../desktop/session-defaults.cjs');
test('refresh choices are bounded and legacy sessions retain the original interval',()=>{
 assert.equal(validateRefreshInterval(),1500);
 for(const value of REFRESH_INTERVALS)assert.equal(validateRefreshInterval(value),value);
 for(const value of [null,true,'1500',-1,1,Infinity,NaN,300001])assert.throws(()=>validateRefreshInterval(value));
});
test('refresh waits for completion before starting another full interval',()=>{
 let time=0;const schedule=createFolderRefreshSchedule({now:()=>time});
 assert.equal(schedule.due('a',1500),false);time=1500;assert.equal(schedule.due('a',1500),true);
 time=10000;assert.equal(schedule.due('a',1500),false);schedule.complete('a');
 time=11499;assert.equal(schedule.due('a',1500),false);time=11500;assert.equal(schedule.due('a',1500),true);
});
test('paused views do not scan and disabled refresh stays disabled',()=>{
 let time=0;const schedule=createFolderRefreshSchedule({now:()=>time});
 schedule.due('a',1500);time=5000;assert.equal(schedule.due('a',1500,true),false);
 assert.equal(schedule.due('a',1500,false),true);schedule.complete('a');
 assert.equal(schedule.due('a',0),false);time=999999;assert.equal(schedule.due('a',0),false);
 assert.equal(schedule.due(null,1500),false);time+=2000;assert.equal(schedule.due(null,1500),false);
});
test('changing views or intervals resets the deadline and ignores other view completions',()=>{
 let time=0;const schedule=createFolderRefreshSchedule({now:()=>time});
 schedule.due('a',1500);time=1500;assert.equal(schedule.due('a',1500),true);
 assert.equal(schedule.due('b',5000),false);time=2000;schedule.complete('a');
 time=6500;assert.equal(schedule.due('b',5000),true);schedule.complete('b');
 assert.equal(schedule.due('b',15000),false);time=21499;assert.equal(schedule.due('b',15000),false);
 time=21500;assert.equal(schedule.due('b',15000),true);
});
test('reusable folder defaults preserve refresh choices and reject invalid intervals',()=>{
 const make=value=>({type:'folder-compare',options:{folderView:{mode:'tree',sort:'name',descending:false,...value}}});
 assert.equal(Object.hasOwn(validateDefaultProfile(make({})).options.folderView,'refreshIntervalMs'),false);
 for(const refreshIntervalMs of REFRESH_INTERVALS)assert.equal(validateDefaultProfile(make({refreshIntervalMs})).options.folderView.refreshIntervalMs,refreshIntervalMs);
 assert.throws(()=>validateDefaultProfile(make({refreshIntervalMs:12})));
});
