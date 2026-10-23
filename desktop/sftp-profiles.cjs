'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {isIP}=require('node:net');
const {domainToASCII}=require('node:url');
const queues=new Map();
const messages={INVALID_PROFILE:'Invalid remote profile.',PROFILE_NOT_FOUND:'Remote profile no longer exists.',PROFILE_LIMIT:'You can save up to 100 remote profiles.',PROFILE_STORE_INVALID:'Saved remote profiles are damaged or unsupported.',PROFILE_STORE_IO:'Could not access saved remote profiles.'};
const fail=code=>Object.assign(new Error(messages[code]),{code});
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
function normalize(value,stored=false){
 if(!plain(value)||Reflect.ownKeys(value).some(key=>!['id','name','host','port','username','root'].includes(key)))throw fail('INVALID_PROFILE');
 const {id,username}=value;let {name,host,root}=value;const port=value.port??22;
 if((stored||id!==undefined)&&!uuid(id))throw fail('INVALID_PROFILE');
 if(typeof name!=='string'||!(name=name.trim())||name.length>120||/[\x00-\x1f\x7f]/.test(name))throw fail('INVALID_PROFILE');
 if(typeof username!=='string'||!username||username.length>256||/[\x00-\x1f\x7f]/.test(username))throw fail('INVALID_PROFILE');
 if(typeof host!=='string')throw fail('INVALID_PROFILE');
 host=host.trim().toLowerCase();if(/[\s\x00-\x1f\x7f/\\@?#]/.test(host))throw fail('INVALID_PROFILE');
 if(host.startsWith('[')&&host.endsWith(']'))host=host.slice(1,-1);
 if(!isIP(host)){host=domainToASCII(host.replace(/\.$/,''));if(!host||!host.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))throw fail('INVALID_PROFILE');}
 if(!host||host.length>253||!Number.isInteger(port)||port<1||port>65535)throw fail('INVALID_PROFILE');
 if(typeof root!=='string'||!root.startsWith('/')||root.length>4096||/[\\\x00-\x1f\x7f]/.test(root)||root.split('/').some(part=>part==='.'||part==='..'))throw fail('INVALID_PROFILE');
 root=path.posix.normalize(root);if(root!=='/')root=root.replace(/\/$/,'');
 return {id:id??randomUUID(),name,host,port,username,root};
}
/** Native-only, credential-free connection presets. list() returns a fresh array;
 * save({id?,name,host,port=22,username,root}) returns the saved profile. Supplying
 * an id updates an existing record only. remove(id) returns whether it existed.
 * No host-key approval, password, key material or connection authority is stored.
 * All instances for the same file share a queue within this process. */
class SftpProfiles{
 #file;
 constructor(file){if(typeof file!=='string'||!path.isAbsolute(file)||file.includes('\0'))throw fail('INVALID_PROFILE');this.#file=path.resolve(file);}
 #run(work){const previous=queues.get(this.#file)||Promise.resolve();const result=previous.then(work);const tail=result.catch(()=>{});queues.set(this.#file,tail);tail.then(()=>{if(queues.get(this.#file)===tail)queues.delete(this.#file);});return result.catch(error=>{throw messages[error?.code]?error:fail('PROFILE_STORE_IO');});}
 async #read(){
  let content;try{const info=await fs.lstat(this.#file);if(!info.isFile()||info.size>2*1024*1024)throw fail('PROFILE_STORE_INVALID');content=await fs.readFile(this.#file,'utf8');}catch(error){if(error.code==='ENOENT')return [];throw error;}
  try{const data=JSON.parse(content);if(!plain(data)||Object.keys(data).sort().join(',')!=='profiles,version'||data.version!==1||!Array.isArray(data.profiles)||data.profiles.length>100)throw Error();const ids=new Set();return data.profiles.map(item=>{const profile=normalize(item,true);if(Object.keys(item).length!==6||Object.keys(profile).some(key=>profile[key]!==item[key])||ids.has(profile.id))throw Error();ids.add(profile.id);return profile;});}catch{throw fail('PROFILE_STORE_INVALID');}
 }
 async #write(profiles){
  await fs.mkdir(path.dirname(this.#file),{recursive:true});const temp=this.#file+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temp,JSON.stringify({version:1,profiles},null,2)+'\n',{flag:'wx',mode:0o600});await fs.rename(temp,this.#file);}finally{await fs.rm(temp,{force:true}).catch(()=>{});}
 }
 list(){return this.#run(()=>this.#read());}
 save(value){let profile;try{profile=normalize(value);}catch(error){return Promise.reject(error);}const update=value.id!==undefined;return this.#run(async()=>{const profiles=await this.#read();const index=profiles.findIndex(item=>item.id===profile.id);if(update&&index<0)throw fail('PROFILE_NOT_FOUND');if(index<0){if(profiles.length>=100)throw fail('PROFILE_LIMIT');profiles.push(profile);}else profiles[index]=profile;await this.#write(profiles);return {...profile};});}
 remove(id){if(!uuid(id))return Promise.reject(fail('INVALID_PROFILE'));return this.#run(async()=>{const profiles=await this.#read(),remaining=profiles.filter(item=>item.id!==id);if(remaining.length===profiles.length)return false;await this.#write(remaining);return true;});}
}
module.exports={SftpProfiles};
