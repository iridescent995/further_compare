'use strict';
// Native, read-only BIFF8 formatting census. The sanitized value parser never
// receives these records. Current XF properties are authoritative; fAtr* flags
// govern future parent-style changes, not current value inheritance.
// MS-XLS CellXF, Font, FontIndex, Icv, Palette, Cell Table, XFIndex:
// https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-xls/671c8577-901f-4215-9ebf-6f5890e5896d
// https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-xls/291a910c-cb69-4799-875e-a201845d4fd1
// https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-xls/b3413c2b-ca5b-4988-86be-ab44bfe9e4d3
// https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-xls/b7160f4e-abe8-444d-a76c-8f076a007d98
// https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-xls/bf61236a-a89e-4425-9679-34992c61ae5e
// https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-xls/d690007d-d25c-4822-a650-b24c13288bb7
const {resolveBuiltinNumberFormat}=require('./workbook-number-formats.cjs');
const GROUPS=['font','fill','border','alignment','protection','numFmt','richText'];
const COLORS=('000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF '+
 '000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 800000 008000 000080 808000 800080 008080 C0C0C0 808080 '+
 '9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF 000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF '+
 '00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 003366 339966 003300 333300 993300 993366 333399 333333').split(' ');
const BORDERS=['none','thin','medium','dashed','dotted','thick','double','hair','mediumDashed','dashDot','mediumDashDot','dashDotDot','mediumDashDotDot','slantDashDot'];
const PATTERNS=['none','solid','mediumGray','darkGray','lightGray','darkHorizontal','darkVertical','darkDown','darkUp','darkGrid','darkTrellis','lightHorizontal','lightVertical','lightDown','lightUp','lightGrid','lightTrellis','gray125','gray0625'];
const HORIZONTAL=['general','left','center','right','fill','justify','centerContinuous','distributed'],VERTICAL=['top','middle','bottom','justify','distributed'];
const u16=(b,p)=>{if(p<0||p+2>b.length)throw Error('Truncated formatting record.');return b[p]|b[p+1]<<8;};
const u32=(b,p)=>(u16(b,p)+u16(b,p+2)*65536)>>>0;
const unavailable=reason=>({style:{},unavailableGroups:Object.fromEntries(GROUPS.map(g=>[g,reason]))});
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
function createXlsStyleResolver(records,customFormats=new Map()){
 const fonts=[],xfs=[],extensions=new Set();let palette=null,paletteIssue=null,globalIssue=null,mode=null,metadataBytes=0;
 for(const {id,data:b}of records){if(id===0x809){mode=u16(b,2)===5?'globals':'sheet';continue;}if(id===0xa){mode=null;continue;}if(mode!=='globals')continue;
  if([0x31,0xe0,0x92,0x87d].includes(id)){metadataBytes+=b.length;if(metadataBytes>8*1024*1024)throw Error('XLS formatting metadata exceeds 8 MiB.');}
  if(id===0x31){if(fonts.length>=1022)throw Error('XLS font count exceeds limit.');fonts.push(b);}
  if(id===0xe0){if(xfs.length>=4096)throw Error('XLS style count exceeds limit.');xfs.push(b);}
  if(id===0x92){if(palette!==null||paletteIssue){paletteIssue='Duplicate color palette.';continue;}if(b.length!==226||u16(b,0)!==56){paletteIssue='Invalid color palette.';continue;}palette=Array.from({length:56},(_,i)=>Array.from(b.subarray(2+i*4,5+i*4),n=>n.toString(16).padStart(2,'0')).join('').toUpperCase());}
  if(id===0x87d){if(b.length<20||u16(b,0)!==id){globalIssue='Malformed XF extension.';continue;}extensions.add(u16(b,14));}
 }
 function color(index){if(index===0x7fff||index===64)return {auto:true};if(index===65)return {system:'window'};if(index<0||index>63)throw Error('Unsupported system or invalid color.');if(index>=8&&paletteIssue)throw Error(paletteIssue);return {argb:'FF'+(index<8||palette===null?COLORS[index]:palette[index-8])};}
 const fontCache=new Map();
 function font(index){if(fontCache.has(index)){const v=fontCache.get(index);if(v instanceof Error)throw v;return v;}let value;
  try{if(index===4||index>1022)throw Error('Invalid font reference.');const b=fonts[index<4?index:index-1];if(!b||b.length<16)throw Error('Missing or truncated font.');const size=u16(b,0),flags=u16(b,2),weight=u16(b,6),script=u16(b,8),underline=b[10],n=b[14],wide=b[15];if(wide>1||b.length!==16+n*(wide?2:1)||size>8191||size>0&&size<20||![400,700].includes(weight)||script>2||![0,1,2,33,34].includes(underline)||b[11]>5)throw Error('Unsupported font properties.');let name='';for(let i=0;i<n;i++)name+=String.fromCharCode(wide?u16(b,16+i*2):b[16+i]);if(!name||/[\x00-\x1f]/.test(name))throw Error('Invalid font name.');value={name,size:size/20,color:color(u16(b,4))};if(weight===700)value.bold=true;for(const [bit,key]of [[2,'italic'],[8,'strike'],[16,'outline'],[32,'shadow'],[64,'condense'],[128,'extend']])if(flags&bit)value[key]=true;if(script)value.vertAlign=script===1?'superscript':'subscript';if(underline)value.underline=({1:true,2:'double',33:'singleAccounting',34:'doubleAccounting'})[underline];if(b[11])value.family=b[11];if(b[12])value.charset=b[12];freeze(value);
  }catch(error){value=error;}fontCache.set(index,value);if(value instanceof Error)throw value;return value;
 }
 const cache=new Map();let signatureBytes=0;
 function resolve(index){if(cache.has(index))return cache.get(index);const b=xfs[index];let result;
  if(!b||b.length!==20)result=unavailable('Missing or malformed cell XF.');
  else {const flags=u16(b,4),parent=flags>>>4;let invalid=globalIssue;if(flags&4)invalid='A cell references a style XF.';else if(parent>=xfs.length||!(u16(xfs[parent],4)&4)||u16(xfs[parent],4)>>>4!==4095)invalid='Invalid parent style XF.';
   if(invalid)result=unavailable(invalid);else{const style={},unknown={};const group=(key,fn)=>{try{style[key]=fn();}catch(e){unknown[key]=e.message;}};
    group('font',()=>font(u16(b,0)));
    group('numFmt',()=>{const id=u16(b,2),code=id>=164?customFormats.get(id):resolveBuiltinNumberFormat(id);if(typeof code!=='string'||!code||code.length>4096||/[\x00-\x1f]/.test(code))throw Error('Unresolved or locale-dependent number format.');return code;});
    group('alignment',()=>{const h=b[6]&7,v=(b[6]>>>4)&7,rotation=b[7],reading=b[8]>>>6;if(v>4||reading>2||rotation>180&&rotation!==255||b[6]&128&&h!==7)throw Error('Invalid alignment properties.');const a={};if(h)a.horizontal=HORIZONTAL[h];if(v!==2)a.vertical=VERTICAL[v];if(b[6]&8)a.wrapText=true;if(b[6]&128)a.justifyLastLine=true;if(rotation)a.textRotation=rotation===255?'vertical':rotation<=90?rotation:90-rotation;if(b[8]&15)a.indent=b[8]&15;if(b[8]&16)a.shrinkToFit=true;if(reading)a.readingOrder=reading===1?'ltr':'rtl';return a;});
    group('protection',()=>{const p={};if(!(flags&1))p.locked=false;if(flags&2)p.hidden=true;return p;});
    group('border',()=>{const lines=u16(b,10),colors=u16(b,12),more=u32(b,14),out={};const edge=(key,line,ink)=>{if(line>=BORDERS.length)throw Error('Unsupported border style.');if(line){if(!ink)throw Error('Missing border color.');out[key]={style:BORDERS[line],color:color(ink)};}};edge('left',lines&15,colors&127);edge('right',(lines>>>4)&15,(colors>>>7)&127);edge('top',(lines>>>8)&15,more&127);edge('bottom',(lines>>>12)&15,(more>>>7)&127);const diagonal=colors>>>14;if(diagonal){edge('diagonal',(more>>>21)&15,(more>>>14)&127);if(diagonal&1)out.diagonalDown=true;if(diagonal&2)out.diagonalUp=true;}return out;});
    group('fill',()=>{const pattern=u32(b,14)>>>26,colors=u16(b,18);if(pattern>=PATTERNS.length)throw Error('Unsupported fill pattern.');const f={type:'pattern',pattern:PATTERNS[pattern]};if(pattern){f.fgColor=color(colors&127);if(pattern!==1)f.bgColor=color((colors>>>7)&127);}return f;});
    if(flags&8)unknown.alignment='Quote-prefixed cell formatting is not qualified.';
    if(extensions.has(index)||(u32(b,14)&0x2000000)){for(const g of ['font','fill','border','alignment'])unknown[g]='Extended XF formatting is not qualified.';}
    for(const g of Object.keys(unknown))delete style[g];result={style,...(Object.keys(unknown).length?{unavailableGroups:unknown}:{})};
   }
  }
  signatureBytes+=JSON.stringify(result).length;if(signatureBytes>16*1024*1024)throw Error('XLS style signature budget exceeded.');freeze(result);cache.set(index,result);return result;
 }
 return {resolve};
}
function attachXlsFormatting(records,sheets,customFormats){
 const resolver=createXlsStyleResolver(records,customFormats),byOffset=new Map(sheets.map(s=>[s.offset,s])),metadata=new Map(sheets.map(s=>[s,{rows:new Map(),columns:[],issue:null}]));let current=null;
 for(const {id,data:b,p}of records){if(id===0x809){current=byOffset.get(p)||null;continue;}if(id===0xa){current=null;continue;}if(!current)continue;const m=metadata.get(current);
  if(id===0x208){if(b.length!==16){m.issue='Malformed row formatting.';continue;}if(!(b[12]&128))continue;const row=u16(b,0);if(row>=65536||m.rows.has(row)){m.issue='Duplicate row formatting.';continue;}m.rows.set(row,u16(b,14)&4095);}
  if(id===0x7d){if(b.length!==12){m.issue='Malformed column formatting.';continue;}const firstColumn=u16(b,0),lastColumn=u16(b,2);if(firstColumn>lastColumn||firstColumn>255||lastColumn>256||m.columns.length>=256){m.issue='Invalid or excessive column formatting.';continue;}m.columns.push({firstColumn,lastColumn:Math.min(lastColumn,255),xf:u16(b,6)});}
 }
 for(const sheet of sheets){const m=metadata.get(sheet),defaultStyle=resolver.resolve(15);m.columns.sort((a,b)=>a.firstColumn-b.firstColumn);if(m.columns.some((c,i)=>i&&c.firstColumn<=m.columns[i-1].lastColumn))m.issue='Overlapping column formatting.';
  const issueValue=m.issue?freeze(unavailable(m.issue)):null,resolve=xf=>issueValue||resolver.resolve(xf),cells=sheet.formatCells.map(({row,column,xf,richText})=>{const value=resolve(xf);return {row,column,...value,...(richText?{unavailableGroups:{...value.unavailableGroups,richText:'Stored rich-text runs are not qualified.'}}:{})};}),rowStyles=[...m.rows].sort((a,b)=>a[0]-b[0]).map(([row,xf])=>({row,...resolve(xf)})),columnStyles=m.columns.map(({firstColumn,lastColumn,xf})=>({firstColumn,lastColumn,...resolve(xf)}));
  const base=issueValue||defaultStyle,all=[base,...cells,...rowStyles,...columnStyles],reason=m.issue||all.find(v=>v.unavailableGroups)?.unavailableGroups;sheet.formatting={available:!reason,reason:typeof reason==='string'?reason:reason?Object.values(reason)[0]:null,cells,extent:{rows:sheet.rows,columns:sheet.columns},defaultStyle:base,rowStyles,columnStyles};
 }
}
module.exports={attachXlsFormatting,createXlsStyleResolver};
