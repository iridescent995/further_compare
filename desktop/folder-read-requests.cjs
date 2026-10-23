'use strict';
const validTicket=t=>t&&typeof t==='object'&&!Array.isArray(t)&&Object.keys(t).length===3&&['sessionId','requestId'].every(k=>typeof t[k]==='string'&&/^[a-f0-9-]{36}$/.test(t[k]))&&(t.revision===null||typeof t.revision==='string'&&/^[a-f0-9-]{36}$/.test(t.revision));
function validateFolderReadTicket(ticket){if(!validTicket(ticket))throw Error('Invalid folder read request.');return {...ticket};}
function createFolderReadRequests(){
 const records=new Map();let disposed=false;
 const same=(record,ticket,authority)=>record.authority===authority&&record.ticket.sessionId===ticket.sessionId&&record.ticket.revision===ticket.revision;
 const trim=()=>{for(const [id,record] of records){if(records.size<=1024)break;if(!record.active)records.delete(id);}};
 return {
  async run(value,authority,work){const ticket=validateFolderReadTicket(value);if(disposed)throw Error('Folder read requests disposed.');const prior=records.get(ticket.requestId);if(prior){if(same(prior,ticket,authority)&&prior.controller.signal.aborted){const error=Error('Folder comparison cancelled.');error.code='ABORT_ERR';throw error;}throw Error('Folder read request already used.');}const record={ticket,authority,controller:new AbortController(),active:true};records.set(ticket.requestId,record);try{return await work(record.controller.signal);}finally{record.active=false;trim();}},
  cancel(value,authority){const ticket=validateFolderReadTicket(value);if(disposed)return false;const record=records.get(ticket.requestId);if(record){if(!same(record,ticket,authority)||!record.active)return false;record.controller.abort();return true;}const controller=new AbortController();controller.abort();records.set(ticket.requestId,{ticket,authority,controller,active:false});trim();return true;},
  dispose(){disposed=true;for(const record of records.values())record.controller.abort();records.clear();}
 };
}
module.exports={createFolderReadRequests,validateFolderReadTicket};
