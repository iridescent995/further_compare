'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const modulePromise=import('../src/pdf-page-order.mjs'),viewport={transform:[1,0,0,-1,0,792]},item=(str,x,y,width=20,size=12)=>({str,dir:'ltr',width,height:size,transform:[size,0,0,size,x,y]});
test('Page rows is deterministic, preserves fragments/whitespace and ignores source EOL',async()=>{const {orderPdfPageItems,ORDER_VERSION}=await modulePromise;assert.equal(ORDER_VERSION,1);const items=[item('Left',60,700),item('Right',310,700),item('Lower',60,680)];for(const order of [[0,1,2],[2,1,0],[1,2,0]])assert.equal(orderPdfPageItems(order.map(i=>({...items[i],hasEOL:i===0})),{viewport}),'Left Right\nLower');assert.equal(orderPdfPageItems([item('A',0,700,10),item(' ',10,700,3),item('B',13,700,10),{str:''}],{viewport}),'A B');assert.equal(orderPdfPageItems([item(' ',0,700,0)],{viewport}),' ');assert.equal(orderPdfPageItems([],{viewport}),'');});
test('geometry/direction ambiguity is explicit, including overprints and unsupported skew/rotation',async()=>{const {orderPdfPageItems}=await modulePromise;for(const items of [[{...item('x',1,1),dir:'rtl'}],[{...item('x',1,1),dir:'ttb'}],[{...item('x',1,1),transform:[12,1,0,12,1,1]}],[{...item('x',1,1),transform:[0,12,-12,0,1,1]}],[item('a',0,700),item('b',0,700)],[item('a',0,700),item(' ',2,700,0),item('b',3,700)],[item('a',0,700),item('b',0,696)],[item('x',0,0,0)],[{...item('x',0,0),width:Infinity}],[item('a\nb',0,0)]])assert.throws(()=>orderPdfPageItems(items,{viewport}),{code:'DOCUMENT_ORDER_UNSUPPORTED'});assert.throws(()=>orderPdfPageItems([item('x',0,0)],{viewport:{transform:[1,1,0,-1,0,0]}}),{code:'DOCUMENT_ORDER_UNSUPPORTED'});});
test('item/output/separator limits and cancellation are enforced without changing input',async()=>{const {orderPdfPageItems}=await modulePromise,items=[item('é',0,700),item('é',100,700)],before=structuredClone(items);assert.throws(()=>orderPdfPageItems(items,{viewport,maxItems:1}),{code:'DOCUMENT_LIMIT'});assert.throws(()=>orderPdfPageItems(items,{viewport,maxOutputBytes:4}),{code:'DOCUMENT_LIMIT'});assert.throws(()=>orderPdfPageItems(items,{viewport,signal:{aborted:true}}),{code:'DOCUMENT_CANCELLED'});let reads=0;assert.throws(()=>orderPdfPageItems(items,{viewport,signal:{get aborted(){return ++reads>2;}}}),{code:'DOCUMENT_CANCELLED'});assert.deepEqual(items,before);});
test('real independent ReportLab PDFs normalize drawing order, preserve real changes and qualify rotation/font geometry',async()=>{
 require('@napi-rs/canvas');const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),{orderPdfPageItems}=await modulePromise,root=path.dirname(require.resolve('pdfjs-dist/package.json')),texts={};
 for(const name of ['row-major','column-major','changed-word','mixed-fonts','sideways','rotated-horizontal','overlap']){const file=path.join(__dirname,'fixtures/pdf-page-order',name+'.pdf'),bytes=await fs.readFile(file),copy=Buffer.from(bytes),task=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,useWorkerFetch:false,standardFontDataUrl:path.join(root,'standard_fonts')+path.sep,verbosity:0});try{const doc=await task.promise,page=await doc.getPage(1),content=await page.getTextContent(),vp=page.getViewport({scale:1});if(['sideways','overlap'].includes(name))assert.throws(()=>orderPdfPageItems(content.items,{viewport:vp}),{code:'DOCUMENT_ORDER_UNSUPPORTED'});else texts[name]=orderPdfPageItems(content.items,{viewport:vp});assert.deepEqual(bytes,copy);assert.deepEqual(await fs.readFile(file),copy);}finally{await task.destroy();}}
 assert.equal(texts['row-major'],'Left top Right top\nLeft bottom Right bottom');assert.equal(texts['column-major'],texts['row-major']);assert.equal(texts['changed-word'],'Left top Right top\nLeft bottom Right changed');assert.equal(texts['mixed-fonts'],'Small Large\nNext line');assert.equal(texts['rotated-horizontal'],'Rotated horizontal');
});

test('baseline tolerance is permutation-independent and legal Unicode items are retained',async()=>{const {orderPdfPageItems}=await modulePromise,items=[item('Ω',0,700,8,12),item('中',30,699,12,12),item('🚀',60,700,12,12)];for(const permutation of [[0,1,2],[2,0,1],[1,2,0],[2,1,0]])assert.equal(orderPdfPageItems(permutation.map(i=>items[i]),{viewport}),'Ω 中 🚀');assert.equal(orderPdfPageItems([item('A',0,700,10),item('B',10,700,10)],{viewport}),'AB');});

test('Page columns uses wide persistent gutters, handles spanning rows, and leaves Page rows unchanged',async()=>{
 const {orderPdfPageColumns,orderPdfPageItems,COLUMN_ORDER_VERSION}=await modulePromise;assert.equal(COLUMN_ORDER_VERSION,1);
 const items=[item('Heading',40,740,400,16),item('L1',60,700,70),item('R1',330,700,70),item('L2',60,680,70),item('R2',330,680,70),item('Footer',40,80,400,12)];
 const expected='Heading\nL1\nL2\nR1\nR2\nFooter';
 for(const order of [items,items.slice().reverse(),[items[3],items[5],items[2],items[0],items[4],items[1]]])assert.equal(orderPdfPageColumns(order,{viewport}),expected);
 assert.equal(orderPdfPageItems(items,{viewport}),'Heading\nL1 R1\nL2 R2\nFooter');
 const staggered=[item('L1',60,700,70),item('R1',330,690,70),item('L2',60,670,70),item('R2',330,660,70)];assert.equal(orderPdfPageColumns(staggered,{viewport}),'L1\nL2\nR1\nR2');
 const three=[item('A1',0,700),item('B1',100,700),item('C1',200,700),item('A2',0,680),item('B2',100,680),item('C2',200,680)];assert.equal(orderPdfPageColumns(three,{viewport}),'A1\nA2\nB1\nB2\nC1\nC2');
});

test('Page columns retains whitespace and fragments, falls back for ordinary rows, and preserves limits',async()=>{
 const {orderPdfPageColumns,orderPdfPageItems}=await modulePromise;
 for(const items of [[],[item(' ',0,700,0)],[item('First',0,700,40),item('word',45,700,30),item('Next',0,680,40),item('word',45,680,30)],[item('A',0,700,10),item(' ',10,700,4),item('B',14,700,10),item('Next',0,680,40)]])assert.equal(orderPdfPageColumns(items,{viewport}),orderPdfPageItems(items,{viewport}));
 const items=[item('é',0,700),item('Ω',100,700),item('中',0,680),item('🚀',100,680)],before=structuredClone(items);
 assert.equal(orderPdfPageColumns(items,{viewport}),'é\n中\nΩ\n🚀');assert.deepEqual(items,before);
 assert.throws(()=>orderPdfPageColumns(items,{viewport,maxItems:3}),{code:'DOCUMENT_LIMIT'});assert.throws(()=>orderPdfPageColumns(items,{viewport,maxOutputBytes:11}),{code:'DOCUMENT_LIMIT'});
 assert.throws(()=>orderPdfPageColumns(items,{viewport,signal:{aborted:true}}),{code:'DOCUMENT_CANCELLED'});
 let reads=0;assert.throws(()=>orderPdfPageColumns(items,{viewport,signal:{get aborted(){return ++reads>35;}}}),{code:'DOCUMENT_CANCELLED'});
 for(const value of [[{...item('X',0,700),dir:'rtl'}],[item('A',0,700),item('B',0,700)],[{...item('X',0,700),transform:[12,1,0,12,0,700]}]])assert.throws(()=>orderPdfPageColumns(value,{viewport}),{code:'DOCUMENT_ORDER_UNSUPPORTED'});
});

test('Page columns matches independent ReportLab column and multi-band fixtures without masking changed text',async()=>{
 require('@napi-rs/canvas');const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),{orderPdfPageColumns}=await modulePromise,root=path.dirname(require.resolve('pdfjs-dist/package.json')),fixture=path.join(__dirname,'fixtures/pdf-page-columns'),expected=JSON.parse(await fs.readFile(path.join(fixture,'expected.json'),'utf8')),texts={};
 for(const name of ['row-major','column-major','changed-word','multi-band']){const file=path.join(fixture,name+'.pdf'),bytes=await fs.readFile(file),copy=Buffer.from(bytes),task=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,useWorkerFetch:false,standardFontDataUrl:path.join(root,'standard_fonts')+path.sep,verbosity:0});try{const doc=await task.promise,page=await doc.getPage(1),content=await page.getTextContent();texts[name]=orderPdfPageColumns(content.items,{viewport:page.getViewport({scale:1})});assert.deepEqual(bytes,copy);assert.deepEqual(await fs.readFile(file),copy);}finally{await task.destroy();}}
 assert.equal(texts['row-major'],expected.columnText);assert.equal(texts['column-major'],expected.columnText);assert.equal(texts['changed-word'],expected.changedText);assert.equal(texts['multi-band'],expected.multiBandText);
});

test('Page columns replaces only gutter-crossing whitespace and handles large flat layouts without argument spreading',async()=>{
 const {orderPdfPageColumns}=await modulePromise;
 const items=[item('L1 ',0,700,30),item(' ',30,700,70),item('R1',100,700,20),item('L2',0,680,20),item(' ',20,680,80),item('R2',100,680,20)];
 assert.equal(orderPdfPageColumns(items,{viewport}),'L1 \nL2\nR1\nR2');
 const flat=Array.from({length:130000},(_,i)=>item('x',0,700-i*20,8));
 const text=orderPdfPageColumns(flat,{viewport});assert.equal(text.length,flat.length*2-1);assert.equal(text.split('\n').length,flat.length);
});
