'use strict';
// Bounded MS-CFB v3/v4 stream reader. Container admission only: no DOC/XLS
// interpretation, encryption handling, embedded-object execution or I/O.
// https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-cfb/
// Qualification: 32 MiB input/stream totals, 4096 directory slots, 1 Mi UTF-16
// path budget. Validate hierarchy/ownership, not red-black balancing/order.
// v3 legacy uninitialized high stream-size DWORD is ignored per MS-CFB 2.6.3.
// Conservative JS uppercase sibling collision checks may refuse rare names.
const FREE=0xffffffff,END=0xfffffffe,FAT=0xfffffffd,DIF=0xfffffffc;
const LIMITS=Object.freeze({inputBytes:32*1024*1024,directoryEntries:4096});
function fail(message){throw Error('Compound file: '+message);}
function readCompoundFile(input) {
  if (!(input instanceof Uint8Array)) fail('Expected binary bytes');
  if (input.length > LIMITS.inputBytes || input.length < 1536) fail('Invalid or excessive input size');
  const b = Uint8Array.from(input), v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u16 = p => v.getUint16(p, true), u32 = p => v.getUint32(p, true);
  if (![0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].every((x,i)=>b[i]===x)) fail('Not a compound file');
  const major=u16(26), shift=u16(30), size=2**shift;
  if (u16(28)!==0xfffe || !((major===3&&shift===9)||(major===4&&shift===12)) || u16(32)!==6 || u32(56)!==4096) fail('Unsupported compound file profile');
  if (b.length%size || (major===3&&u32(40)!==0) || b.subarray(34,40).some(x=>x) || b.subarray(8,24).some(x=>x) || (major===4&&b.subarray(512,size).some(x=>x))) fail('Invalid compound header');
  const sectors=b.length/size-1, entriesPer=size/4, owner=new Map();
  const valid=id=>Number.isInteger(id)&&id>=0&&id<sectors;
  const claim=(id,label)=>{if(!valid(id)||owner.has(id))fail('Invalid, cyclic or overlapping sector chain');owner.set(id,label);};
  const sector=id=>{if(!valid(id))fail('Sector outside file');return b.subarray((id+1)*size,(id+2)*size);};
  const words=a=>{const d=new DataView(a.buffer,a.byteOffset,a.byteLength);return Array.from({length:a.length/4},(_,i)=>d.getUint32(i*4,true));};
  const fatCount=u32(44), difCount=u32(72), fatIds=[];
  if(!fatCount||fatCount>Math.ceil(sectors/entriesPer)||difCount>Math.ceil(Math.max(0,fatCount-109)/(entriesPer-1)))fail('Invalid allocation table count');
  let freeSeen=false;
  const addFat=id=>{if(id===FREE){freeSeen=true;return;}if(freeSeen)fail('Non-contiguous DIFAT entries');claim(id,'FAT');fatIds.push(id);if(fatIds.length>fatCount)fail('Excess FAT sectors');};
  for(let p=76;p<512;p+=4)addFat(u32(p));
  let next=u32(68);
  for(let i=0;i<difCount;i++){claim(next,'DIFAT');const a=words(sector(next));for(let j=0;j<a.length-1;j++)addFat(a[j]);next=a[a.length-1];}
  if(next!==END || fatIds.length!==fatCount)fail('DIFAT chain/count mismatch');
  const fat=fatIds.flatMap(id=>words(sector(id)));
  if(fat.length<sectors)fail('Incomplete FAT');
  for(const [id,label] of owner)if(fat[id] !== (label==='FAT'?FAT:DIF))fail('Allocation table self marker mismatch');
  for(let i=sectors;i<fat.length;i++)if(fat[i]!==FREE)fail('FAT references beyond file');
  function chain(start,table,max,claimEntry,count) {
    const ids=[];let id=start;
    if(count===0){if(id!==END&&id!==FREE)fail('Nonempty zero-length stream');return ids;}
    while(id!==END){if(!Number.isInteger(id)||id<0||id>=max||ids.length>=max)fail('Invalid allocation chain');claimEntry(id);ids.push(id);if(count!==undefined&&ids.length>count)fail('Excess stream sectors');id=table[id];}
    if(count!==undefined&&ids.length!==count)fail('Truncated stream chain');return ids;
  }
  function normal(start,count,label){return chain(start,fat,sectors,id=>claim(id,label),count);}
  function join(ids,read,length=ids.length*size){const out=new Uint8Array(length);let p=0;for(const id of ids){const a=read(id);out.set(a.subarray(0,Math.min(a.length,length-p)),p);p+=Math.min(a.length,length-p);}return out;}
  const dirIds=normal(u32(48),major===4?u32(40):undefined,'directory');
  if(!dirIds.length||dirIds.length*size/128>LIMITS.directoryEntries)fail('Directory limit exceeded');
  const directory=join(dirIds,sector), dv=new DataView(directory.buffer), dirs=[];
  for(let p=0;p<directory.length;p+=128){
    const type=directory[p+66], n=dv.getUint16(p+64,true);
    if(!type){dirs.push(null);continue;}
    if(![1,2,5].includes(type)||n<2||n>64||n%2||dv.getUint16(p+n-2,true)!==0||directory[p+67]>1)fail('Invalid directory entry');
    let name='';for(let q=p;q<p+n-2;q+=2){const c=dv.getUint16(q,true);if(!c)fail('Embedded null in directory name');name+=String.fromCharCode(c);}
    const high=dv.getUint32(p+124,true), low=dv.getUint32(p+120,true);
    if(type!==1&&(major===4&&high||low>LIMITS.inputBytes))fail('Stream size limit exceeded');
    if(/[\\/:!]/.test(name)||!name||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(name))fail('Invalid directory name');
    dirs.push({name,type,left:dv.getUint32(p+68,true),right:dv.getUint32(p+72,true),child:dv.getUint32(p+76,true),start:dv.getUint32(p+116,true),size:low});
  }
  if(!dirs[0]||dirs[0].type!==5||dirs[0].left!==FREE||dirs[0].right!==FREE||dirs.slice(1).some(x=>x?.type===5))fail('Invalid root directory');
  const seen=new Set([0]), pending=[{id:dirs[0].child,parent:0}], names=new Map();
  const paths=new Map([[0,'']]), storagePaths=[];let pathBytes=0;
  while(pending.length){const {id,parent}=pending.pop();if(id===FREE)continue;if(id>=dirs.length||!dirs[id]||seen.has(id))fail('Invalid or cyclic directory tree');seen.add(id);const d=dirs[id], key=`${parent}:${d.name.toUpperCase()}`;
    if(names.has(key))fail('Duplicate directory name');names.set(key,id);const path=paths.get(parent)?paths.get(parent)+'/'+d.name:d.name;pathBytes+=path.length;if(path.length>32768||pathBytes>1024*1024)fail('Directory path budget exceeded');paths.set(id,path);if(d.type===1)storagePaths.push(path);
    pending.push({id:d.left,parent},{id:d.right,parent});
    if(d.type===1)pending.push({id:d.child,parent:id});else if(d.child!==FREE)fail('Stream has children');

  }
  if(dirs.some((d,i)=>d&&!seen.has(i)))fail('Unreachable directory entry');
  const miniCount=u32(64);if(miniCount>Math.ceil(dirs[0].size/64/entriesPer))fail('Excess mini FAT sectors');
  const miniIds=normal(u32(60),miniCount,'mini FAT'), miniFat=miniIds.flatMap(id=>words(sector(id)));
  const root=dirs[0], rootIds=normal(root.start,Math.ceil(root.size/size),'mini stream'), miniStream=join(rootIds,sector,root.size), miniMax=Math.floor(root.size/64), miniOwner=new Set();
  if(root.size%64)fail('Unaligned mini stream');
  const fullStreams=new Map(),rootStreams=new Map();let outputBytes=0;
  for(let i=1;i<dirs.length;i++){const d=dirs[i];if(!d||d.type!==2)continue;outputBytes+=d.size;if(outputBytes>LIMITS.inputBytes)fail('Aggregate stream size limit exceeded');let data;
    if(d.size<4096){const ids=chain(d.start,miniFat,Math.min(miniMax,miniFat.length),id=>{if(miniOwner.has(id))fail('Overlapping mini stream');miniOwner.add(id);},Math.ceil(d.size/64));data=join(ids,id=>miniStream.subarray(id*64,id*64+64),d.size);}
    else {const ids=normal(d.start,Math.ceil(d.size/size),`stream ${i}`);data=join(ids,sector,d.size);}
    fullStreams.set(paths.get(i),data);if(!paths.get(i).includes('/'))rootStreams.set(d.name,data);
  }
  for(let i=0;i<sectors;i++)if(!owner.has(i)&&fat[i]!==FREE)fail('Orphan allocated sector');
  for(let i=0;i<miniFat.length;i++)if(!miniOwner.has(i)&&miniFat[i]!==FREE)fail('Orphan mini sector');
  const copies=map=>new Map([...map].map(([name,bytes])=>[name,bytes.slice()]));
  // Each accessor returns a detached view; mutations cannot alter subsequent reads.
  return Object.freeze({version:major,sectorSize:size,streamCount:fullStreams.size,totalStreamBytes:outputBytes,storagePaths:Object.freeze(storagePaths.slice()),get streams(){return copies(rootStreams);},get fullStreams(){return copies(fullStreams);}});
}
module.exports={readCompoundFile};
