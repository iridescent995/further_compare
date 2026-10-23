'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {preflightXls}=require('../src/xls-preflight.cjs');
const FREE=0xffffffff,END=0xfffffffe;
function record(id,data=Buffer.alloc(0)){const b=Buffer.alloc(data.length+4);b.writeUInt16LE(id);b.writeUInt16LE(data.length,2);data.copy(b,4);return b;}
function bof(type){const b=Buffer.alloc(16);b.writeUInt16LE(0x600);b.writeUInt16LE(type,2);return record(0x809,b);}
function workbook(cells=[],extra=[]){const bound=Buffer.from([0,0,0,0,0,0,1,0,83]),date=record(0x22,Buffer.from([1,0]));let globals=[bof(5),date,record(0x85,bound),record(0xe0,Buffer.alloc(20)),...extra,record(10)];const offset=globals.reduce((n,b)=>n+b.length,0);globals[2].writeUInt32LE(offset,4);const dim=Buffer.alloc(14);dim.writeUInt32LE(1,4);dim.writeUInt16LE(1,10);return Buffer.concat([...globals,bof(16),record(0x200,dim),...cells,record(10)]);}
function cfb(data){const n=Math.max(8,Math.ceil(data.length/512));let nf=1;while(nf<Math.ceil((n+nf+1)/128))nf++;const b=Buffer.alloc((n+nf+2)*512);Buffer.from('d0cf11e0a1b11ae1','hex').copy(b);b.writeUInt16LE(0x3e,24);b.writeUInt16LE(3,26);b.writeUInt16LE(0xfffe,28);b.writeUInt16LE(9,30);b.writeUInt16LE(6,32);b.writeUInt32LE(nf,44);b.writeUInt32LE(nf,48);b.writeUInt32LE(4096,56);b.writeUInt32LE(END,60);b.writeUInt32LE(END,68);for(let p=76;p<512;p+=4)b.writeUInt32LE(FREE,p);for(let i=0;i<nf;i++)b.writeUInt32LE(i,76+4*i);for(let p=512;p<(nf+1)*512;p+=4)b.writeUInt32LE(FREE,p);for(let i=0;i<nf;i++)b.writeUInt32LE(0xfffffffd,512+i*4);b.writeUInt32LE(END,512+nf*4);for(let i=0;i<n;i++)b.writeUInt32LE(i===n-1?END:i+nf+2,512+(i+nf+1)*4);
 function entry(index,name,type,start,size,child=FREE){const p=(nf+1)*512+index*128;Buffer.from(name+'\0','utf16le').copy(b,p);b.writeUInt16LE((name.length+1)*2,p+64);b[p+66]=type;b[p+67]=1;b.writeUInt32LE(FREE,p+68);b.writeUInt32LE(FREE,p+72);b.writeUInt32LE(child,p+76);b.writeUInt32LE(start,p+116);b.writeUInt32LE(size,p+120);}
 entry(0,'Root Entry',5,END,0,1);entry(1,'Workbook',2,nf+1,n*512);data.copy(b,(nf+2)*512);return b;}
function cfbV4(data){const n=Math.max(8,Math.ceil(data.length/4096));let nf=1;while(nf<Math.ceil((n+nf+1)/1024))nf++;const b=Buffer.alloc((n+nf+2)*4096);Buffer.from('d0cf11e0a1b11ae1','hex').copy(b);b.writeUInt16LE(0x3e,24);b.writeUInt16LE(4,26);b.writeUInt16LE(0xfffe,28);b.writeUInt16LE(12,30);b.writeUInt16LE(6,32);b.writeUInt32LE(1,40);b.writeUInt32LE(nf,44);b.writeUInt32LE(nf,48);b.writeUInt32LE(4096,56);b.writeUInt32LE(END,60);b.writeUInt32LE(END,68);for(let p=76;p<512;p+=4)b.writeUInt32LE(FREE,p);for(let i=0;i<nf;i++)b.writeUInt32LE(i,76+4*i);for(let p=4096;p<(nf+1)*4096;p+=4)b.writeUInt32LE(FREE,p);for(let i=0;i<nf;i++)b.writeUInt32LE(0xfffffffd,4096+i*4);b.writeUInt32LE(END,4096+nf*4);for(let i=0;i<n;i++)b.writeUInt32LE(i===n-1?END:i+nf+2,4096+(i+nf+1)*4);
 function entry(index,name,type,start,size,child=FREE){const p=(nf+1)*4096+index*128;Buffer.from(name+'\0','utf16le').copy(b,p);b.writeUInt16LE((name.length+1)*2,p+64);b[p+66]=type;b[p+67]=1;b.writeUInt32LE(FREE,p+68);b.writeUInt32LE(FREE,p+72);b.writeUInt32LE(child,p+76);b.writeUInt32LE(start,p+116);b.writeUInt32LE(size,p+120);}
 entry(0,'Root Entry',5,END,0,1);entry(1,'Workbook',2,nf+1,n*4096);data.copy(b,(nf+2)*4096);return b;}
function formula(kind=0){const d=Buffer.alloc(24);d.writeDoubleLE(12,6);d.writeUInt16LE(2,20);d[22]=0xff;d[23]=0xff;if(kind){d.fill(0,6,14);d[6]=kind;d.writeUInt16LE(65535,12);}return record(6,d);}
function rawRecords(bytes){let p=0,out=[];while(p<bytes.length){const n=bytes[p+2]|bytes[p+3]<<8;out.push({id:bytes[p]|bytes[p+1]<<8,data:bytes.slice(p+4,p+4+n),p});p+=4+n;}return out;}
const fixture=()=>fs.readFileSync(path.join(__dirname,'xls-fixtures/libreoffice-control.xls'));
test('independent LibreOffice XLS fixture retains values, formula census and Unicode string bytes',()=>{const b=fixture(),before=Buffer.from(b),r=preflightXls(b);assert.equal(r.cellCount,16);assert.deepEqual(r.sheets.map(s=>s.name),['Data','Other']);assert.equal(r.sheets[0].formulas.length,2);assert.equal(r.date1904,false);assert.ok(r.rawWorkbook.length<b.length);assert.deepEqual(b,before);const records=rawRecords(r.rawWorkbook);assert.ok(records.some(x=>x.id===0xfc));assert.equal(records.filter(x=>x.id===6).every(x=>x.data.length===22&&x.data[20]===0),true);});
test('cached-value projection removes untrusted formula tokens and unrelated metadata with rebuilt sheet offsets',()=>{const input=cfb(workbook([formula()],[definedName('Rate',[0x1e,7,0])]));const r=preflightXls(input),rs=rawRecords(r.rawWorkbook);assert.equal(r.date1904,true);assert.equal(r.sheets[0].formulas[0].cacheType,'number');assert.ok(!rs.some(x=>x.id===0x18));const bound=rs.find(x=>x.id===0x85).data,offset=new DataView(bound.buffer,bound.byteOffset).getUint32(0,true);assert.equal(rs.find(x=>x.p===offset).id,0x809);assert.equal(rs.find(x=>x.id===6).data.length,22);});
test('formula empty, boolean, error and unavailable caches remain distinct',()=>{for(const [type,cacheType] of [[1,'boolean'],[2,'error'],[3,'string'],[4,'unavailable']]){const r=preflightXls(cfb(workbook([formula(type)])));assert.equal(r.sheets[0].formulas[0].cacheType,cacheType);}});
test('formula string cache supports encoding continuation and rejects missing bytes',()=>{const f=formula(3);f[10]=0;const str=record(0x207,Buffer.from([4,0,0,65,66])),cont=record(0x3c,Buffer.from([1,0xa9,3,45,78]));const r=preflightXls(cfb(workbook([f,str,cont])));assert.equal(r.sheets[0].formulas[0].cacheType,'string');assert.ok(rawRecords(r.rawWorkbook).some(x=>x.id===0x3c));assert.throws(()=>preflightXls(cfb(workbook([f,str]))),/Truncated formula string/);const missing=preflightXls(cfb(workbook([f])));assert.equal(missing.sheets[0].formulas[0].cacheType,'unavailable');});
test('rejects disguised input, truncation, unsupported headers and cyclic normal sectors',()=>{assert.throws(()=>preflightXls(Buffer.alloc(2000)),/compound XLS/);const b=cfb(workbook());assert.throws(()=>preflightXls(b.subarray(0,b.length-1)),/header/);const bad=Buffer.from(b);bad.writeUInt16LE(5,26);assert.throws(()=>preflightXls(bad),/profile/);const cycle=Buffer.from(b);cycle.writeUInt32LE(2,520);assert.throws(()=>preflightXls(cycle),/cyclic|overlapping/);});
test('rejects overlapping streams, cyclic directory topology and orphan allocation',()=>{const b=cfb(workbook());const d=Buffer.from(b);d.writeUInt32LE(1,1024+128+68);assert.throws(()=>preflightXls(d),/directory tree/);const orphan=Buffer.from(b);orphan.writeUInt32LE(END,512+120*4);assert.throws(()=>preflightXls(orphan),/beyond file/);const overlap=Buffer.from(b);overlap.writeUInt32LE(0,1024+128+116);assert.throws(()=>preflightXls(overlap),/overlapping/);});
test('rejects corrupt mini FAT chains in the independent producer fixture',()=>{const b=fixture(),miniFatSector=b.readUInt32LE(60),m=(miniFatSector+1)*512;b.writeUInt32LE(0,m);assert.throws(()=>preflightXls(b),/mini stream|allocation chain|stream sectors/);});
test('rejects encryption, duplicate cells, unknown SST indexes and excessive worksheet extents',()=>{assert.throws(()=>preflightXls(cfb(workbook([],[record(0x2f,Buffer.alloc(2))]))),/Encrypted/);assert.throws(()=>preflightXls(cfb(workbook([formula(),formula()]))),/Duplicate worksheet cell/);const s=Buffer.alloc(10);assert.throws(()=>preflightXls(cfb(workbook([record(0xfd,s)]))),/shared string index/);const f=formula();f.writeUInt16LE(50000,4);assert.throws(()=>preflightXls(cfb(workbook([f]))),/extent limit/);});
test('SST counts and string sizes are checked before the reader sees them',()=>{const s=Buffer.alloc(8);s.writeUInt32LE(0xffffffff);s.writeUInt32LE(0xffffffff,4);assert.throws(()=>preflightXls(cfb(workbook([],[record(0xfc,s)]))),/string count/);const a=Buffer.alloc(11);a.writeUInt32LE(1);a.writeUInt32LE(1,4);a.writeUInt16LE(65535,8);assert.throws(()=>preflightXls(cfb(workbook([],[record(0xfc,a)]))),/String limit/);});
test('SST continuation encoding switches are bounded and preserved',()=>{const a=Buffer.alloc(13);a.writeUInt32LE(1);a.writeUInt32LE(1,4);a.writeUInt16LE(4,8);a[11]=65;a[12]=66;const c=Buffer.from([1,0xa9,3,45,78]),s=Buffer.alloc(10);const r=preflightXls(cfb(workbook([record(0xfd,s)],[record(0xfc,a),record(0x3c,c)])));assert.equal(r.stringCharacters,4);assert.equal(rawRecords(r.rawWorkbook).filter(x=>x.id===0x3c).length,1);c[0]=8;assert.throws(()=>preflightXls(cfb(workbook([],[record(0xfc,a),record(0x3c,c)]))),/encoding/);});

test('XF indices and custom number formats cannot silently lose date semantics',()=>{const f=formula();f.writeUInt16LE(1,8);assert.throws(()=>preflightXls(cfb(workbook([f]))),/Missing cell format/);const xf=Buffer.alloc(20);xf.writeUInt16LE(164,2);assert.throws(()=>preflightXls(cfb(workbook([],[record(0xe0,xf)]))),/Missing custom number format/);const fmt=Buffer.from([164,0,1,0,0,121]);assert.throws(()=>preflightXls(cfb(workbook([],[record(0x41e,fmt),record(0x41e,fmt)]))),/Duplicate or reserved/);fmt.writeUInt16LE(14);assert.throws(()=>preflightXls(cfb(workbook([],[record(0x41e,fmt)]))),/Duplicate or reserved/);});
test('MULRK and MULBLANK validate every XF index',()=>{for(const id of [0xbd,0xbe]){const stride=id===0xbd?6:2,d=Buffer.alloc(6+2*stride);d.writeUInt16LE(1,4+stride);d.writeUInt16LE(1,d.length-2);assert.throws(()=>preflightXls(cfb(workbook([record(id,d)]))),/Missing cell format/);}});

test('format arrays have explicit admission limits',()=>{assert.throws(()=>preflightXls(cfb(workbook([],Array.from({length:4096},()=>record(0xe0,Buffer.alloc(20)))))),/excessive cell format/);const formats=Array.from({length:4097},(_,i)=>{const b=Buffer.from([0,0,1,0,0,121]);b.writeUInt16LE(164+i);return record(0x41e,b);});assert.throws(()=>preflightXls(cfb(workbook([],formats))),/format count/);});
test('repeated shared strings count toward projected output budget',()=>{const s=Buffer.alloc(8011,65);s.writeUInt32LE(1400);s.writeUInt32LE(1,4);s.writeUInt16LE(8000,8);s[10]=0;const cells=Array.from({length:1400},(_,row)=>{const d=Buffer.alloc(10);d.writeUInt16LE(row);return record(0xfd,d);});assert.throws(()=>preflightXls(cfb(workbook(cells,[record(0xfc,s)]))),/Projected string budget/);});

function numberXf(id=0,{style=false,independent=false}={}){const d=Buffer.alloc(20);d.writeUInt16LE(id,2);if(style)d.writeUInt16LE(4,4);if(independent)d[9]|=4;return record(0xe0,d);}
function numberFormat(id,code,wide=false){const d=Buffer.alloc(5+code.length*(wide?2:1));d.writeUInt16LE(id);d.writeUInt16LE(code.length,2);d[4]=+wide;for(let i=0;i<code.length;i++)if(wide)d.writeUInt16LE(code.charCodeAt(i),5+2*i);else d[5+i]=code.charCodeAt(i);return record(0x41e,d);}
function formattedBlank(row,column,xf){const d=Buffer.alloc(6);d.writeUInt16LE(row);d.writeUInt16LE(column,2);d.writeUInt16LE(xf,4);return record(0x201,d);}
function numberWorkbook(cells=[],extra=[]){return cfb(workbook(cells,[...Array.from({length:15},()=>numberXf()),...extra]));}
test('XLS number-format census resolves definitions independently of custom IDs and includes styled blanks',()=>{
 const a=preflightXls(numberWorkbook([formattedBlank(2,3,16)],[numberFormat(164,'0.00'),numberXf(164)]));
 const b=preflightXls(numberWorkbook([formattedBlank(2,3,16)],[numberFormat(230,'0.00'),numberXf(230)]));
 const builtin=preflightXls(numberWorkbook([formattedBlank(2,3,16)],[numberXf(2)]));
 assert.deepEqual(a.sheets[0].numberFormats,{available:true,cells:[{row:2,column:3,formatCode:'0.00'}]});assert.deepEqual(b.sheets[0].numberFormats,a.sheets[0].numberFormats);assert.deepEqual(builtin.sheets[0].numberFormats,a.sheets[0].numberFormats);
 const unicode=preflightXls(numberWorkbook([formattedBlank(0,0,16)],[numberFormat(164,'0 "é中"',true),numberXf(164)]));assert.equal(unicode.sheets[0].numberFormats.cells[0].formatCode,'0 "é中"');
});
test('XLS number formats retain every MULRK/MULBLANK XF and preserve formula token sanitization',()=>{
 for(const id of [0xbd,0xbe]){const stride=id===0xbd?6:2,d=Buffer.alloc(6+2*stride);d.writeUInt16LE(15,4);d.writeUInt16LE(16,4+stride);d.writeUInt16LE(1,d.length-2);const result=preflightXls(numberWorkbook([record(id,d)],[numberXf(10)]));assert.deepEqual(result.sheets[0].numberFormats,{available:true,cells:[{row:0,column:0,formatCode:'General'},{row:0,column:1,formatCode:'0.00%'}]});}
 const f=formula();f.writeUInt16LE(16,8);const result=preflightXls(numberWorkbook([f],[numberXf(2)]));assert.equal(result.sheets[0].numberFormats.cells[0].formatCode,'0.00');assert.equal(rawRecords(result.rawWorkbook).find(r=>r.id===6).data.length,22);
});
test('XLS stored ifmt remains authoritative with clear fAtrNum, per MS-XLS CellXF',()=>{
 // https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-xls/671c8577-901f-4215-9ebf-6f5890e5896d
 const cells=[formattedBlank(0,0,16)];for(const independent of [true,false])assert.equal(preflightXls(numberWorkbook(cells,[numberXf(2,{independent})])).sheets[0].numberFormats.cells[0].formatCode,'0.00');
 const result=preflightXls(fixture());assert.equal(result.sheets.every(s=>s.numberFormats.available),true);assert.equal(result.sheets.reduce((n,s)=>n+s.numberFormats.cells.length,0),16);
});
test('XLS row/column inherited or unqualified defaults are unavailable without preventing value import',()=>{
 const row=Buffer.alloc(16);row[12]=0x80;row.writeUInt16LE(16,14);const col=Buffer.alloc(12);col.writeUInt16LE(256,2);col.writeUInt16LE(16,6);
 for(const inherited of [record(0x208,row),record(0x7d,col)]){const result=preflightXls(numberWorkbook([inherited,formattedBlank(0,0,15)],[numberXf(2)]));assert.equal(result.sheets[0].numberFormats.available,false);assert.match(result.sheets[0].numberFormats.reason,/Inherited row or column/);assert.equal(result.cellCount,1);}
 row.writeUInt16LE(15,14);col.writeUInt16LE(15,6);assert.equal(preflightXls(numberWorkbook([record(0x208,row),record(0x7d,col),formattedBlank(0,0,15)])).sheets[0].numberFormats.available,true);
 for(const inherited of [record(0x208,Buffer.alloc(1)),record(0x7d,Buffer.alloc(1))])assert.equal(preflightXls(numberWorkbook([inherited])).sheets[0].numberFormats.available,false);
 const missing=preflightXls(cfb(workbook([formattedBlank(0,0,0)])));assert.match(missing.sheets[0].numberFormats.reason,/default/);
 const nonGeneral=preflightXls(cfb(workbook([],[...Array.from({length:14},()=>numberXf()),numberXf(2)])));assert.equal(nonGeneral.sheets[0].numberFormats.available,false);
});
test('XLS unsupported format metadata never falls back to an equal General code',()=>{
 for(const extra of [[numberXf(23)],[numberXf(2,{style:true})],[numberFormat(164,'0\0'),numberXf(164)],[numberFormat(164,'0'.repeat(4097)),numberXf(164)]]){const result=preflightXls(numberWorkbook([formattedBlank(0,0,16)],extra));assert.equal(result.sheets[0].numberFormats.available,false);assert.deepEqual(result.sheets[0].numberFormats.cells,[]);assert.equal(result.cellCount,1);}
 const repeated=Array.from({length:4200},(_,row)=>formattedBlank(row,0,16));const result=preflightXls(numberWorkbook(repeated,[numberFormat(164,'0'.repeat(4000)),numberXf(164)]));assert.equal(result.sheets[0].numberFormats.available,false);assert.match(result.sheets[0].numberFormats.reason,/limit/);assert.equal(result.cellCount,4200);
});

test('independent LibreOffice number-format fixtures preserve codes and formatting-only blank differences',()=>{
 const read=name=>{const bytes=fs.readFileSync(path.join(__dirname,'fixtures/workbook-number-formats',name+'.xls')),before=Buffer.from(bytes),result=preflightXls(bytes);assert.deepEqual(bytes,before);return result;};
 const a=read('baseline'),b=read('changed');assert.equal(a.sheets.every(s=>s.numberFormats.available),true);assert.equal(b.sheets.every(s=>s.numberFormats.available),true);
 assert.deepEqual(a.sheets[0].numberFormats.cells.map(c=>c.formatCode),['0.00','0%','#,##0','@','0.0000']);assert.deepEqual(b.sheets[0].numberFormats.cells.map(c=>c.formatCode),['0.000','0%','#,##0','@','0.00000']);assert.equal(a.sheets[0].coordinates.find(c=>c.row===4&&c.column===0).blank,true);
});

function definedName(name,tokens,scope=0){const b=Buffer.alloc(15+name.length+tokens.length);b[3]=name.length;b.writeUInt16LE(tokens.length,4);b.writeUInt16LE(scope,8);Buffer.from(name).copy(b,15);Buffer.from(tokens).copy(b,15+name.length);return record(0x18,b);}
function tokenFormula(row,column,tokens,{shared=false,extra=[]}={}){const b=Buffer.alloc(22+tokens.length+extra.length);b.writeUInt16LE(row);b.writeUInt16LE(column,2);b.writeDoubleLE(12,6);b.writeUInt16LE(shared?8:0,14);b.writeUInt16LE(tokens.length,20);Buffer.from(tokens).copy(b,22);Buffer.from(extra).copy(b,22+tokens.length);return record(6,b);}
function formulaGroup(kind,{firstRow=0,lastRow=1,firstColumn=0,lastColumn=0}={},tokens=[0x1e,7,0],useCount=2){const start=kind==='shared'?8:12,b=Buffer.alloc(start+2+tokens.length);b.writeUInt16LE(firstRow);b.writeUInt16LE(lastRow,2);b[4]=firstColumn;b[5]=lastColumn;if(kind==='shared')b[7]=useCount;b.writeUInt16LE(tokens.length,start);Buffer.from(tokens).copy(b,start+2);return record(kind==='shared'?0x4bc:0x221,b);}
test('XLS formula census copies original token and extra bytes without handing them to value parser',()=>{
 const input=cfb(workbook([tokenFormula(0,0,[0x20,0,0,0,0,0,0,0],{extra:[0,0,0,1,2,3]})]));const before=Buffer.from(input),result=preflightXls(input),f=result.sheets[0].formulas[0];
 assert.deepEqual([...f.tokens],[0x20,0,0,0,0,0,0,0]);assert.deepEqual([...f.extra],[0,0,0,1,2,3]);assert.deepEqual(input,before);
 input.fill(0);assert.equal(f.tokens[0],0x20);f.tokens.fill(255);assert.equal(rawRecords(result.rawWorkbook).find(x=>x.id===6).data.length,22);
});
test('XLS shared and array formula groups retain exact range, anchor and independent bytes',()=>{
 for(const kind of ['shared','array']){const shared=kind==='shared',input=cfb(workbook([tokenFormula(0,0,[1,0,0,0,0],{shared}),formulaGroup(kind),tokenFormula(1,0,[1,0,0,0,0],{shared})])),r=preflightXls(input),g=r.sheets[0].formulaGroups[0];
 assert.deepEqual(g.anchor,{row:0,column:0});assert.deepEqual(g.range,{firstRow:0,lastRow:1,firstColumn:0,lastColumn:0});assert.equal(g.kind,kind);assert.deepEqual([...g.tokens],[0x1e,7,0]);assert.equal(g.extra.length,0);assert.ok(!rawRecords(r.rawWorkbook).some(x=>[0x4bc,0x221].includes(x.id)));
 }
});
test('XLS rejects missing, malformed, misplaced and inconsistent formula groups',()=>{
 const exp=tokenFormula(0,0,[1,0,0,0,0],{shared:true});
 for(const cells of [[exp],[formulaGroup('shared')],[exp,formulaGroup('shared')],[exp,formulaGroup('array')],[tokenFormula(0,0,[0x1e,1,0],{shared:true})],[exp,formulaGroup('shared',{firstRow:1,lastRow:0})],[exp,record(0x4bc,Buffer.alloc(8))],[exp,formulaGroup('shared'),tokenFormula(2,0,[1,0,0,0,0],{shared:true})]])assert.throws(()=>preflightXls(cfb(workbook(cells))),/formula group|Shared formula/i);
});
test('XLS defined names retain scoped definitions and internal links resolve original sheet names',()=>{
 const sup=record(0x1ae,Buffer.from([1,0,1,4])),ext=record(0x17,Buffer.from([1,0,0,0,0,0,0,0]));
 const result=preflightXls(cfb(workbook([tokenFormula(0,0,[0x23,1,0,0,0])],[definedName('Rate',[0x1e,7,0]),definedName('Local',[0x1e,8,0],1),sup,ext])));
 assert.deepEqual(result.formulaContext.names.map(n=>[n.name,n.scope,n.available,[...n.tokens]]),[['Rate',null,true,[0x1e,7,0]],['Local','S',true,[0x1e,8,0]]]);
 assert.deepEqual(result.formulaContext.externSheets,[{available:true,firstSheet:'S',lastSheet:'S'}]);assert.equal(result.formulaContext.records.length,4);assert.ok(!rawRecords(result.rawWorkbook).some(r=>[0x18,0x1ae,0x17].includes(r.id)));
});
test('XLS malformed name/link envelopes reject while unsupported built-in names remain explicit',()=>{
 for(const extras of [[record(0x18,Buffer.alloc(4))],[definedName('Bad',[0x1e,1,0],2)],[record(0x17,Buffer.from([1,0]))],[record(0x17,Buffer.from([1,0,0,0,0,0,0,0]))],[record(0x1ae,Buffer.from([0,0,1,4,0]))]])assert.throws(()=>preflightXls(cfb(workbook([],extras))),/name|reference|workbook/i);
 const built=definedName('X',[0x1e,1,0]);built[4]=0x20;const r=preflightXls(cfb(workbook([],[built])));assert.equal(r.formulaContext.names[0].available,false);assert.match(r.formulaContext.names[0].reason,/Built-in/);
});
test('XLS formula census bounds aggregate copied data and refuses unqualified continuation',()=>{
 assert.throws(()=>preflightXls(cfb(workbook([tokenFormula(0,0,[0x1e,1,0]),record(0x3c,Buffer.from([1]))]))),/Continued cell formula/);
 const zero=tokenFormula(0,0,[]);assert.throws(()=>preflightXls(cfb(workbook([zero]))),/formula token length/);
 const cells=Array.from({length:2100},(_,i)=>tokenFormula(i,0,Array(8100).fill(255)));
 const large=cfbV4(workbook(cells));
 assert.throws(()=>preflightXls(large),/Formula census byte limit/);
});
test('genuine LibreOffice XLS retains shared, array, workbook and local name formula authority',async()=>{
 const root=path.join(__dirname,'xls-formula-fixtures'),bytes=fs.readFileSync(path.join(root,'formulas.xls')),before=Buffer.from(bytes),r=preflightXls(bytes),s=r.sheets[0];
 assert.deepEqual(bytes,before);assert.deepEqual(s.formulaGroups.map(g=>[g.kind,g.anchor,g.range]),[
 ['shared',{row:0,column:3},{firstRow:0,lastRow:2,firstColumn:3,lastColumn:3}],['array',{row:0,column:4},{firstRow:0,lastRow:2,firstColumn:4,lastColumn:4}]]);
 assert.deepEqual(r.formulaContext.names.map(n=>[n.name,n.scope,n.available]),[['Rate',null,true],['LocalRate','Data',true]]);
 assert.equal(s.formulas.length,9);assert.deepEqual(r.formulaContext.externSheets,[{available:true,firstSheet:'Data',lastSheet:'Data'},{available:true,firstSheet:'Other',lastSheet:'Other'}]);
 const Excel=require('exceljs'),book=new Excel.Workbook();await book.xlsx.readFile(path.join(root,'readback.xlsx'));const sheet=book.getWorksheet('Data');assert.equal(sheet.getCell('C1').result,5);assert.equal(sheet.getCell('C2').result,12);assert.equal(sheet.getCell('C3').result,4);for(const col of ['D','E'])for(let row=1;row<=3;row++)assert.equal(sheet.getCell(col+row).result??sheet.getCell(col+row).value,row*4);
 assert.ok(!rawRecords(r.rawWorkbook).some(x=>[0x4bc,0x221,0x18,0x17,0x1ae].includes(x.id)));assert.ok(rawRecords(r.rawWorkbook).filter(x=>x.id===6).every(x=>x.data.length===22));
});
test('XLS grouped string cache survives intervening group records in sanitized value stream',()=>{
 const f=tokenFormula(0,0,[1,0,0,0,0]);f.fill(0,10,18);f.writeUInt16LE(65535,16);
 const r=preflightXls(cfb(workbook([f,formulaGroup('array',{lastRow:0}),record(0x207,Buffer.from([1,0,0,65]))])));
 assert.equal(r.sheets[0].formulas[0].cacheType,'string');const rs=rawRecords(r.rawWorkbook),i=rs.findIndex(r=>r.id===6);assert.equal(rs[i+1].id,0x207);
});
