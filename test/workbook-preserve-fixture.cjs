'use strict';
const Excel=require('exceljs');
const assert=require('node:assert/strict');
const {parseArchive}=require('../src/archive-core.cjs');
async function workbookFixture(){
 const book=new Excel.Workbook();book.creator='Preservation fixture';book.created=new Date('2020-01-02T03:04:05Z');
 const data=book.addWorksheet('Records',{views:[{state:'frozen',ySplit:1}],pageSetup:{orientation:'landscape',paperSize:9}});
 data.addRows([['id','value','formula','enabled','date'],['first','original',{formula:'40+2',result:42},true,new Date('2024-02-03T00:00:00Z')],['second',7,{formula:'B3*2',result:14},false,new Date('2024-02-04T00:00:00Z')]]);
 data.getCell('B2').font={bold:true,color:{argb:'FF7A3366'}};data.getCell('B2').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF5DAE8'}};data.getCell('B2').border={bottom:{style:'thin',color:{argb:'FF333333'}}};data.getCell('B3').numFmt='0.00';data.getCell('E2').numFmt='yyyy-mm-dd';data.getCell('E3').numFmt='yyyy-mm-dd';data.getColumn(2).width=24;data.getRow(2).height=25;data.autoFilter='A1:E3';data.getCell('B2').note='Keep this comment';
 const hidden=book.addWorksheet('Lookup',{state:'hidden'});hidden.addRows([['key','value'],['constant',123],['calculated',{formula:'Records!B3',result:7}]]);hidden.getCell('B2').font={italic:true};
 book.definedNames.add('Lookup!$B$2','Constant');
 return Buffer.from(await book.xlsx.writeBuffer());
}
async function assertPreserved(original,actual,value){
 const before=parseArchive(original),after=parseArchive(actual);assert.deepEqual([...after.entries.keys()].sort(),[...before.entries.keys()].sort());
 for(const entry of before.entries.values()){if(entry.kind!=='file'||['xl/worksheets/sheet1.xml','xl/workbook.xml'].includes(entry.path))continue;assert.deepEqual(Buffer.from(await after.read(entry.path)),Buffer.from(await before.read(entry.path)),'Untouched ZIP member '+entry.path);}
 const workbookXml=Buffer.from(await after.read('xl/workbook.xml')).toString();if(!Buffer.from(actual).equals(Buffer.from(original)))assert.match(workbookXml,/fullCalcOnLoad="1"/);const result=new Excel.Workbook();await result.xlsx.load(actual);assert.equal(result.worksheets.length,2);assert.equal(result.creator,'Preservation fixture');assert.deepEqual(result.definedNames.getRanges('Constant').ranges,['Lookup!$B$2']);const data=result.getWorksheet('Records');assert.equal(data.getCell('B2').value,value);assert.equal(data.getCell('B2').font.bold,true);assert.equal(data.getCell('B2').fill.fgColor.argb,'FFF5DAE8');assert.equal(data.getCell('B2').note,'Keep this comment');assert.equal(data.getCell('C2').formula,'40+2');assert.equal(data.getCell('C2').result,42);assert.equal(data.getCell('B3').value,7);assert.equal(data.getCell('D2').value,true);assert.equal(data.getCell('D3').value,false);assert.equal(data.getCell('E2').value.toISOString(),'2024-02-03T00:00:00.000Z');assert.equal(data.pageSetup.orientation,'landscape');assert.equal(data.pageSetup.paperSize,9);assert.equal(data.views[0].state,'frozen');assert.equal(data.views[0].ySplit,1);assert.equal(data.autoFilter,'A1:E3');assert.equal(data.getColumn(2).width,24);assert.equal(data.getRow(2).height,25);assert.equal(result.getWorksheet('Lookup').state,'hidden');assert.equal(result.getWorksheet('Lookup').getCell('B2').value,123);
}
module.exports={workbookFixture,assertPreserved};
