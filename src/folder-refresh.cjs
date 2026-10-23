'use strict';
const REFRESH_INTERVALS=Object.freeze([0,1500,5000,15000,30000,60000,300000]);
function validateRefreshInterval(value=1500){
 if(!REFRESH_INTERVALS.includes(value))throw Error('Invalid folder refresh interval.');
 return value;
}
// Tracks the active view only. A completed scan starts a fresh interval, so slow
// I/O cannot cause overlapping scans or an immediate retry loop.
function createFolderRefreshSchedule({now=()=>performance.now()}={}){
 let context=null,interval=0,next=0,inFlight=false;
 return {
  due(key,value,blocked=false){
   const duration=validateRefreshInterval(value),time=now();
   if(key!==context||duration!==interval){context=key;interval=duration;next=time+duration;inFlight=false;}
   if(!key||!duration||blocked||inFlight||time<next)return false;
   inFlight=true;return true;
  },
  complete(key){if(key===context){inFlight=false;next=now()+interval;}}
 };
}
module.exports={REFRESH_INTERVALS,validateRefreshInterval,createFolderRefreshSchedule};
