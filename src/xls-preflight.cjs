'use strict';
// Structural admission checks for unencrypted CFB v3/v4 BIFF8 workbooks.
// MS-CFB and MS-XLS define the on-disk structures; this is not a formula evaluator.
const {attachXlsFormatting}=require('./xls-formatting.cjs');
const {resolveBuiltinNumberFormat}=require('./workbook-number-formats.cjs');
const FREE = 0xffffffff, END = 0xfffffffe, FAT = 0xfffffffd, DIF = 0xfffffffc;
const LIMITS = Object.freeze({ inputBytes: 32 * 1024 * 1024, directoryEntries: 4096, records: 500000, sheets: 64, rows: 50000, columns: 256, cells: 500000, strings: 500000, stringCharacters: 8 * 1024 * 1024 });
function fail(message) { throw new Error(`XLS: ${message}`); }
function preflightXls(input) {
  if (!(input instanceof Uint8Array)) fail('Expected binary bytes');
  if (input.length > LIMITS.inputBytes || input.length < 1536) fail('Invalid or excessive input size');
  const b = input, v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u16 = p => v.getUint16(p, true), u32 = p => v.getUint32(p, true);
  if (![0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].every((x,i)=>b[i]===x)) fail('Not a compound XLS file');
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
    if(high||low>LIMITS.inputBytes)fail('Stream size limit exceeded');
    dirs.push({name,type,left:dv.getUint32(p+68,true),right:dv.getUint32(p+72,true),child:dv.getUint32(p+76,true),start:dv.getUint32(p+116,true),size:low});
  }
  if(!dirs[0]||dirs[0].type!==5||dirs[0].left!==FREE||dirs[0].right!==FREE||dirs.slice(1).some(x=>x?.type===5))fail('Invalid root directory');
  const seen=new Set([0]), pending=[{id:dirs[0].child,parent:0}], names=new Map();
  let workbook;
  while(pending.length){const {id,parent}=pending.pop();if(id===FREE)continue;if(id>=dirs.length||!dirs[id]||seen.has(id))fail('Invalid or cyclic directory tree');seen.add(id);const d=dirs[id], key=`${parent}:${d.name.toUpperCase()}`;
    if(names.has(key))fail('Duplicate directory name');names.set(key,id);
    pending.push({id:d.left,parent},{id:d.right,parent});
    if(d.type===1)pending.push({id:d.child,parent:id});else if(d.child!==FREE)fail('Stream has children');
    if(/^(Workbook|Book)$/i.test(d.name)){if(workbook!==undefined||parent!==0||d.type!==2||d.name!=='Workbook')fail('Ambiguous or unsupported workbook stream');workbook=id;}
    if(/^(EncryptedPackage|EncryptionInfo)$/i.test(d.name))fail('Encrypted workbook is unsupported');
  }
  if(dirs.some((d,i)=>d&&!seen.has(i))||workbook===undefined)fail('Unreachable directory entry or missing workbook');
  const miniCount=u32(64);if(miniCount>Math.ceil(dirs[0].size/64/entriesPer))fail('Excess mini FAT sectors');
  const miniIds=normal(u32(60),miniCount,'mini FAT'), miniFat=miniIds.flatMap(id=>words(sector(id)));
  const root=dirs[0], rootIds=normal(root.start,Math.ceil(root.size/size),'mini stream'), miniStream=join(rootIds,sector,root.size), miniMax=Math.floor(root.size/64), miniOwner=new Set();
  if(root.size%64)fail('Unaligned mini stream');
  let workbookBytes;
  for(let i=1;i<dirs.length;i++){const d=dirs[i];if(!d||d.type!==2)continue;let data;
    if(d.size<4096){const ids=chain(d.start,miniFat,Math.min(miniMax,miniFat.length),id=>{if(miniOwner.has(id))fail('Overlapping mini stream');miniOwner.add(id);},Math.ceil(d.size/64));if(i===workbook)data=join(ids,id=>miniStream.subarray(id*64,id*64+64),d.size);}
    else {const ids=normal(d.start,Math.ceil(d.size/size),`stream ${i}`);if(i===workbook)data=join(ids,sector,d.size);}
    if(i===workbook)workbookBytes=data;
  }
  for(let i=0;i<sectors;i++)if(!owner.has(i)&&fat[i]!==FREE)fail('Orphan allocated sector');
  for(let i=0;i<miniFat.length;i++)if(!miniOwner.has(i)&&miniFat[i]!==FREE)fail('Orphan mini sector');
  return inspectBiff(workbookBytes);
}
function inspectBiff(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.length), records=[], byOffset=new Map();
  let p=0;
  while(p<bytes.length){if(bytes.length-p<4)fail('Truncated BIFF record');const id=view.getUint16(p,true),n=view.getUint16(p+2,true);if(!id&&!n&&bytes.subarray(p).every(x=>!x))break;if(n>8224||n>bytes.length-p-4||records.length>=LIMITS.records)fail('Invalid BIFF record length/count');const r={id,p,data:bytes.subarray(p+4,p+4+n)};byOffset.set(p,records.length);records.push(r);p+=n+4;}
  const u16=(d,p)=>{if(p+2>d.length)fail('Truncated BIFF field');return new DataView(d.buffer,d.byteOffset,d.length).getUint16(p,true);};
  const u32=(d,p)=>{if(p+4>d.length)fail('Truncated BIFF field');return new DataView(d.buffer,d.byteOffset,d.length).getUint32(p,true);};
  const sstLengths=[],sstRich=[];let projectedCharacters=0;const chargeProjection=n=>{projectedCharacters+=n;if(projectedCharacters>10*1024*1024)fail('Projected string budget exceeded');};
  // Formula bytes are copied into a separate bounded census, never into the value parser.
  // MS-XLS Formula/CellParsedFormula, ShrFmla, Array, Lbl and ExternSheet:
  // https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-xls/8e3c6978-6c9f-4915-a826-07613204b244
  // https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-xls/984826cc-8bb7-412b-9907-7bbb9b08b4ad
  // https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-xls/c6ee7512-d6ec-4d81-8dfb-a01a744a1f39
  // https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-xls/d148e898-4504-4841-a793-ee85f3ea9eef
  const formulaContext={names:[],externSheets:[],records:[]},supBooks=[],xtis=[];
  let formulaBytes=0,groupCount=0,externSheetSeen=false;
  const copyFormula=d=>{formulaBytes+=d.length;if(formulaBytes>16*1024*1024)fail('Formula census byte limit exceeded');return Uint8Array.from(d);};
  const parsedFormula=(d,at)=>{const n=u16(d,at);if(!n||n>d.length-at-2)fail('Invalid formula token length');return {tokens:copyFormula(d.subarray(at+2,at+2+n)),extra:copyFormula(d.subarray(at+2+n))};};
  const sheets=[], names=new Set(),formatIds=new Map(),xfFormats=[],xfStyles=[],cellXfs=new Set();let date1904=false, dateSeen=false;const retained=new Map();let mode=null, sheet=null, globals=false, ended=false, cells=0, sstCount=0, sstSeen=false, characters=0;
  const chargeString=n=>{characters+=n;if(n>32767||characters>LIMITS.stringCharacters)fail('String limit exceeded');};
  function sst(index){const chunks=[records[index].data];let j=index+1;while(records[j]?.id===0x3c)chunks.push(records[j++].data);let ci=0,off=8;const total=u32(chunks[0],0),count=u32(chunks[0],4);if(count>LIMITS.strings||total>LIMITS.cells||count>total)fail('Shared string count limit exceeded');
    const move=()=>{while(ci<chunks.length&&off===chunks[ci].length){ci++;off=0;}if(ci>=chunks.length)fail('Truncated shared string');};
    const byte=()=>{move();return chunks[ci][off++];};const word=()=>byte()|(byte()<<8);const dword=()=>((word()|word()<<16)>>>0);
    for(let k=0;k<count;k++){const n=word(),flags=byte();if(flags&~13)fail('Invalid shared string flags');chargeString(n);sstLengths.push(n);let wide=flags&1,rich=flags&8?word():0,ext=flags&4?dword():0;sstRich.push(rich>0);if(rich>32767||ext>LIMITS.inputBytes)fail('Excess shared string metadata');
      for(let c=0;c<n;c++){if(off===chunks[ci].length){ci++;off=0;if(ci>=chunks.length)fail('Truncated continued string');const f=chunks[ci][off++];if(f&~1)fail('Invalid continued string encoding');wide=f&1;}if(off+(wide?2:1)>chunks[ci].length)fail('Split string character');off+=wide?2:1;}
      let remain=rich*4+ext;while(remain){move();const take=Math.min(remain,chunks[ci].length-off);off+=take;remain-=take;}
    }
    while(ci<chunks.length&&off===chunks[ci].length){ci++;off=0;}if(ci!==chunks.length)fail('Trailing shared string data');sstCount=count;return j-1;
  }
  for(let i=0;i<records.length;i++){const {id,data:d,p:offset}=records[i];
    if(id===0x2f)fail('Encrypted BIFF workbook is unsupported');
    if(id===0x809){if(mode||d.length!==16||u16(d,0)!==0x600)fail('Unsupported or nested BIFF substream');const type=u16(d,2);if(!globals){if(offset!==0||type!==5)fail('Missing BIFF8 workbook globals');globals=true;mode='globals';}else{if(type!==0x10)fail('Only worksheet BIFF8 substreams are supported');sheet=sheets.find(s=>s.offset===offset);if(!sheet||sheet.visited)fail('Undeclared or repeated worksheet');sheet.visited=true;sheet.cells=new Set();mode='sheet';}ended=false;retained.set(i,d);continue;}
    if(id===0xa){if(!mode||d.length)fail('Unexpected BIFF end');mode=null;sheet=null;ended=true;retained.set(i,d);continue;}
    if(!mode)fail('Record outside BIFF substream');
    if(id===0x85){if(mode!=='globals'||d.length<8||d[5]!==0||d[4]>2||d[7]&~1)fail('Unsupported sheet declaration');const n=d[6],wide=d[7]&1;if(!n||n>31||d.length!==8+n*(wide?2:1))fail('Invalid worksheet name');let name='';for(let k=0;k<n;k++)name+=String.fromCharCode(wide?u16(d,8+k*2):d[8+k]);if(names.has(name.toUpperCase())||/[\x00\[\]:*?/\\]/.test(name))fail('Duplicate or invalid worksheet name');names.add(name.toUpperCase());sheets.push({name,offset:u32(d,0),rows:0,columns:0,visibility:d[4],formulas:[],formulaGroups:[],coordinates:[],formatCells:[],formatDefaults:[]});if(sheets.length>LIMITS.sheets)fail('Worksheet limit exceeded');}
    if([0x18,0x1ae,0x17,0x23].includes(id)){
      if(mode!=='globals'||formulaContext.records.length>=4096)fail('Invalid or excessive formula context records');
      const continued=records[i+1]?.id===0x3c;
      const raw={id,data:copyFormula(d),continuations:[]};formulaContext.records.push(raw);
      let j=i+1;while(records[j]?.id===0x3c){if(raw.continuations.length>=4096)fail('Formula continuation limit exceeded');raw.continuations.push(copyFormula(records[j++].data));}
      if(id===0x18){
        if(d.length<15)fail('Truncated defined name');const flags=u16(d,0),n=d[3],count=u16(d,4),scopeIndex=u16(d,8),wide=d[14];
        if(wide&~1)fail('Invalid defined name encoding');const end=15+n*(wide?2:1);
        if(end>d.length||(!continued&&count>d.length-end))fail('Truncated defined name formula');
        let name='';for(let k=0;k<n;k++)name+=String.fromCharCode(wide?u16(d,15+2*k):d[15+k]);
        const available=!continued&&!(flags&0x2e)&&!!name&&!/[\x00-\x1f]/.test(name);
        formulaContext.names.push({name,scopeIndex,available,...(available?{}:{reason:'Built-in, macro or continued defined name is unsupported'}),tokens:copyFormula(d.subarray(end,Math.min(d.length,end+count))),extra:copyFormula(d.subarray(Math.min(d.length,end+count)))});
      }else if(id===0x1ae){
        if(d.length<4)fail('Truncated supporting workbook');const kind=u16(d,2);
        if((kind===0x401||kind===0x3a01)&&d.length!==4)fail('Invalid supporting workbook record');
        supBooks.push({internal:kind===0x401&&!continued});
      }else if(id===0x17){
        if(externSheetSeen)fail('Duplicate external sheet reference collection');externSheetSeen=true;
        const count=u16(d,0);if(continued||d.length!==2+6*count)fail('Unsupported continued or malformed external sheet references');
        if(xtis.length+count>4096)fail('External sheet reference limit exceeded');
        for(let q=2;q<d.length;q+=6)xtis.push({book:u16(d,q),first:u16(d,q+2),last:u16(d,q+4)});
      }else if(d.length<6)fail('Truncated external name');
    }
    if(id===0x4bc||id===0x221){
      if(mode!=='sheet'||++groupCount>4096)fail('Invalid or excessive formula groups');
      const kind=id===0x4bc?'shared':'array',start=kind==='shared'?8:12;
      if(d.length<start+3)fail('Truncated formula group');
      const range={firstRow:u16(d,0),lastRow:u16(d,2),firstColumn:d[4],lastColumn:d[5]};
      if(range.firstRow>range.lastRow||range.firstColumn>range.lastColumn||range.lastRow>=LIMITS.rows)fail('Invalid formula group range');
      let previous=i-1;while(records[previous]?.id===0x3c)previous--;if(records[previous]?.id===0x207)previous--;
      const prior=records[previous];if(prior?.id!==6)fail('Formula group has no preceding formula anchor');
      const anchor={row:u16(prior.data,0),column:u16(prior.data,2)};
      if(anchor.row<range.firstRow||anchor.row>range.lastRow||anchor.column<range.firstColumn||anchor.column>range.lastColumn)fail('Formula group anchor outside range');
      if(records[i+1]?.id===0x3c)fail('Continued formula groups are unsupported');
      sheet.formulaGroups.push({kind,anchor,range,...parsedFormula(d,start),...(kind==='shared'?{useCount:d[7]}:{})});
    }
    if(id===0x81&&(d.length!==2||(u16(d,0)&0x10)))fail('Dialog worksheets are unsupported');
    if(id===0x22){if(mode!=='globals'||dateSeen||d.length!==2||u16(d,0)>1)fail('Invalid date system');dateSeen=true;date1904=!!u16(d,0);}
    if(id===0xfc){if(mode!=='globals'||sstSeen)fail('Duplicate or misplaced shared strings');sstSeen=true;const end=sst(i);for(let j=i;j<=end;j++)retained.set(j,records[j].data);i=end;}
    if(id===0x200){if(mode!=='sheet'||d.length!==14||sheet.dimension)fail('Invalid worksheet dimensions');const a=u32(d,0),z=u32(d,4),c=u16(d,8),e=u16(d,10);if(a>z||c>e||z>LIMITS.rows||e>LIMITS.columns||z*e>LIMITS.cells)fail('Invalid worksheet dimensions');sheet.dimension={a,z,c,e};}
    // Cell-bearing records supported by the BIFF8 value reader. Formatting-only
    // blanks are counted as cells too, so they cannot inflate the reader output.
    if([0x6,0x203,0x205,0xfd,0x27e,0x201,0x204,0xd6,0xbd,0xbe].includes(id)){
      if(mode!=='sheet'||d.length<6)fail('Misplaced or truncated cell');let row=u16(d,0),first=u16(d,2),last=first;
      const exact={6:undefined,515:14,517:8,253:10,638:10,513:6};if(exact[id]!==undefined&&d.length!==exact[id])fail('Invalid cell record length');
      if(id===0x6&&(d.length<22||u16(d,20)>d.length-22))fail('Invalid formula token length');
      if(id===0xbd||id===0xbe){last=u16(d,d.length-2);const stride=id===0xbd?6:2;if(last<first||d.length!==6+(last-first+1)*stride)fail('Invalid multi-cell record');}
      if(id===0xbd||id===0xbe){const stride=id===0xbd?6:2;for(let c=first;c<=last;c++)cellXfs.add(u16(d,4+(c-first)*stride));}else cellXfs.add(u16(d,4));
      if(row>=LIMITS.rows||last>=LIMITS.columns)fail('Worksheet extent limit exceeded');
      for(let col=first;col<=last;col++){const key=row*256+col;if(sheet.cells.has(key))fail('Duplicate worksheet cell');sheet.cells.add(key);sheet.coordinates.push({row,column:col,blank:id===0x201||id===0xbe});sheet.formatCells.push({row,column:col,xf:u16(d,(id===0xbd||id===0xbe)?4+(col-first)*(id===0xbd?6:2):4),richText:id===0xfd&&sstRich[u32(d,6)]===true});if(++cells>LIMITS.cells)fail('Cell limit exceeded');}
      sheet.rows=Math.max(sheet.rows,row+1);sheet.columns=Math.max(sheet.columns,last+1);
      if(id===0x6){
        if(records[i+1]?.id===0x3c)fail('Continued cell formula is unsupported');
        let cacheType='number';
        if(u16(d,12)===65535){cacheType=['string','boolean','error','string'][d[6]]||'unavailable';if(d[6]===0&&records[i+1]?.id!==0x207&&!([0x4bc,0x221].includes(records[i+1]?.id)&&records[i+2]?.id===0x207))cacheType='unavailable';}
        else if(!Number.isFinite(new DataView(d.buffer,d.byteOffset,d.length).getFloat64(6,true)))cacheType='unavailable';
        sheet.formulas.push({row,column:first,cacheType,shared:!!(u16(d,14)&8),...parsedFormula(d,20)});
        const safe=d.slice(0,22);safe[20]=safe[21]=0;safe[14]=safe[15]=0;
        if(cacheType==='unavailable')safe.fill(0,6,14);
        retained.set(i,safe);
      }
      if(id===0xfd){if(u32(d,6)>=sstCount)fail('Invalid shared string index');chargeProjection(sstLengths[u32(d,6)]);}
      if(id===0x204){const n=u16(d,6),flags=d[8];if(d.length<9||flags&~1||d.length!==9+n*((flags&1)?2:1))fail('Invalid inline string');chargeString(n);chargeProjection(n);}
      if(id===0xd6)fail('RString rich inline labels are unsupported; use BIFF8 shared strings');
    }
    if(id===0x207){
      const previous=records[i-([0x4bc,0x221].includes(records[i-1]?.id)?2:1)];
      if(mode!=='sheet'||d.length<3||previous?.id!==0x6||u16(previous.data,12)!==65535||previous.data[6]!==0)fail('Invalid formula string cache');
      const n=u16(d,0),f=d[2];chargeString(n);chargeProjection(n);if(f&~1)fail('Unsupported formula string flags');
      // Formula STRING continuation is supported with the same encoding switch
      // semantics as SST character data, without rich/ext metadata.
      let remaining=n,wide=f&1,off=3,j=i;
      while(true){const data=records[j].data,available=data.length-off,unit=wide?2:1,take=Math.min(remaining,Math.floor(available/unit));off+=take*unit;remaining-=take;
        if(off!==data.length)fail('Invalid formula string length');retained.set(j,data);
        if(!remaining)break;j++;if(records[j]?.id!==0x3c||!records[j].data.length)fail('Truncated formula string');wide=records[j].data[0];if(wide&~1)fail('Invalid formula string continuation');off=1;
      }i=j;
    }
    if(id===0x41e){if(mode!=='globals'||formatIds.size>=4096)fail('Number format count exceeded');const fmt=u16(d,0);if(fmt<164||formatIds.has(fmt))fail('Duplicate or reserved number format identifier');const n=u16(d,2),f=d[4];if(d.length<5||f&~1||d.length!==5+n*((f&1)?2:1))fail('Invalid number format string');chargeString(n);let code='';for(let k=0;k<n;k++)code+=String.fromCharCode(f&1?u16(d,5+2*k):d[5+k]);formatIds.set(fmt,code);}
    if(id===0xe0){if(mode!=='globals'||d.length!==20||xfFormats.length>=4096)fail('Invalid or excessive cell format records');xfFormats.push(u16(d,2));xfStyles.push(!!(u16(d,4)&4));}
    // Row/column defaults affect implicit cells; don't silently treat them as General.
    if(id===0x208&&mode==='sheet'){if(d.length!==16)sheet.formatIssue='Malformed row format metadata';else if(d[12]&0x80)sheet.formatDefaults.push(u16(d,14)&0xfff);}
    if(id===0x7d&&mode==='sheet'){if(d.length!==12||u16(d,0)>u16(d,2)||u16(d,2)>256)sheet.formatIssue='Malformed column format metadata';else sheet.formatDefaults.push(u16(d,6));}
    if(id===0x42&&(d.length!==2||u16(d,0)!==1200))fail('Only BIFF8 Unicode code page is supported');
    if([0x85,0x22,0x42,0x41e,0xe0,0x200,0x203,0x204,0x205,0xfd,0x27e,0x201,0xbd,0xbe].includes(id))retained.set(i,d);
    // Old BIFF cell/BOF variants must not bypass the BIFF8 admission rules.
    if([0x9,0x209,0x409,0x2,0x3,0x4,0x5,0x7,0x206,0x406].includes(id))fail('Unsupported older BIFF record');
  }
  if(mode||!globals||!ended||!sheets.length||sheets.some(s=>!s.visited||!byOffset.has(s.offset)))fail('Incomplete workbook substreams');
  for(const name of formulaContext.names){if(name.scopeIndex>sheets.length)fail('Defined name scope outside workbook');name.scope=name.scopeIndex?sheets[name.scopeIndex-1].name:null;delete name.scopeIndex;}
  for(const x of xtis){if(x.book>=supBooks.length)fail('Missing supporting workbook reference');
    if(!supBooks[x.book].internal||x.first>=0xfffe||x.last>=0xfffe)formulaContext.externSheets.push({available:false,reason:'External or deleted sheet reference is unsupported'});
    else{if(x.first>x.last||x.last>=sheets.length)fail('Invalid internal sheet reference');formulaContext.externSheets.push({available:true,firstSheet:sheets[x.first].name,lastSheet:sheets[x.last].name});}}
  for(const s of sheets){
    const groups=new Map(),uses=new Map();for(const g of s.formulaGroups){const key=g.anchor.row*256+g.anchor.column;if(groups.has(key))fail('Duplicate formula group anchor');groups.set(key,g);uses.set(key,0);}
    for(const f of s.formulas){if(f.tokens[0]!==1){if(f.shared)fail('Shared formula lacks group reference');continue;}
      if(f.tokens.length!==5||f.extra.length)fail('Invalid formula group reference');const key=u16(f.tokens,1)*256+u16(f.tokens,3),g=groups.get(key);
      if(!g)fail('Missing formula group');const r=g.range;
      if(f.row<r.firstRow||f.row>r.lastRow||f.column<r.firstColumn||f.column>r.lastColumn||(g.kind==='shared')!==f.shared)fail('Formula group membership mismatch');uses.set(key,uses.get(key)+1);
    }
    for(const [key,g] of groups){const count=uses.get(key),r=g.range;if(count!==(g.kind==='shared'?g.useCount:(r.lastRow-r.firstRow+1)*(r.lastColumn-r.firstColumn+1)))fail('Formula group member count mismatch');}
  }
  for(const id of cellXfs)if(id>=xfFormats.length)fail('Missing cell format reference');
  for(const id of xfFormats)if(id>=164&&!formatIds.has(id))fail('Missing custom number format');
  // MS-XLS CellXF fAtrNum controls updates when the parent style changes; the
  // currently stored ifmt remains authoritative, even when that flag is clear.
  // https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-xls/671c8577-901f-4215-9ebf-6f5890e5896d
  const resolveFormat=id=>id>=164?formatIds.get(id):resolveBuiltinNumberFormat(id);
  const resolveXf=index=>index<xfFormats.length?resolveFormat(xfFormats[index]):null;
  const formatEncoder=new TextEncoder(),formatByteLengths=new Map();
  attachXlsFormatting(records,sheets,formatIds);
  let formatCharacters=0;
  for(const s of sheets){
    let reason=s.formatIssue;
    // BIFF8's implicit cell format is XF 15. A missing/non-General default
    // cannot be represented faithfully by a sparse explicit-cell census.
    // https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-xls/0b683865-eeee-4621-a3d8-b18d20a2afd9
    if(!reason&&(xfFormats.length<=15||xfStyles[15]||resolveXf(15)!=='General'))reason='Implicit default cell number format is not qualified as General';
    if(!reason&&s.formatDefaults.some(index=>xfStyles[index]||resolveXf(index)!=='General'))reason='Inherited row or column number formats are unsupported';
    const entries=[];let characters=0;
    if(!reason)for(const cell of s.formatCells){const code=resolveXf(cell.xf);if(xfStyles[cell.xf]||typeof code!=='string'||!code||code.length>4096||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(code)){reason='Cell number format is unavailable or locale-dependent';break;}if(!formatByteLengths.has(code))formatByteLengths.set(code,formatEncoder.encode(code).length);characters+=formatByteLengths.get(code);if(formatCharacters+characters>16*1024*1024){reason='Number format metadata exceeds the comparison limit';break;}entries.push({row:cell.row,column:cell.column,formatCode:code});}
    if(reason)s.numberFormats={available:false,reason,cells:[]};else{formatCharacters+=characters;s.numberFormats={available:true,cells:entries};}
    delete s.formatCells;delete s.formatDefaults;delete s.formatIssue;
  }
  let projected=0;for(const s of sheets){projected+=s.rows*s.columns;if(projected>LIMITS.cells)fail('Projected rectangular cell limit exceeded');delete s.cells;delete s.visited;delete s.dimension;}
  // Feed only validated value records to the third-party reader. cellFormula:false
  // alone does not prevent its BIFF formula-token parser from running. Rebuild
  // offsets, remove token payloads and omit unneeded drawing/link/name records.
  const pieces=[], mapped=new Map();let length=0;
  for(const [i,d] of [...retained].sort((a,b)=>a[0]-b[0])){const rec=records[i],piece=new Uint8Array(4+d.length),pv=new DataView(piece.buffer);pv.setUint16(0,rec.id,true);pv.setUint16(2,d.length,true);piece.set(d,4);mapped.set(rec.p,length);pieces.push({piece,id:rec.id});length+=piece.length;}
  const rawWorkbook=new Uint8Array(length);let pos=0;
  for(const {piece,id} of pieces){if(id===0x85){const pv=new DataView(piece.buffer),old=pv.getUint32(4,true);if(!mapped.has(old))fail('Invalid sheet target');pv.setUint32(4,mapped.get(old),true);}rawWorkbook.set(piece,pos);pos+=piece.length;}
  return {rawWorkbook,formulaContext,date1904,format:'xls',profile:'cfb-biff8-worksheets',sheets,recordCount:records.length,workbookBytes:bytes.length,cellCount:cells,stringCharacters:characters,projectedCharacters};
}
module.exports={preflightXls, XLS_PREFLIGHT_LIMITS:LIMITS};
