'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {preflightXls}=require('../src/xls-preflight.cjs'),{readLegacyWorkbook}=require('../src/legacy-workbook-reader.cjs'),{compareSheetPair}=require('../src/workbook-sheet-review.cjs');
const source=()=>fs.readFileSync(path.join(__dirname,'xls-formula-fixtures/formulas.xls'));
const read=bytes=>readLegacyWorkbook(bytes,{format:'xls',preflight:preflightXls,parser:require('xlsx')});
function uniqueOffset(bytes,needle){const at=bytes.indexOf(Buffer.from(needle));assert.ok(at>=0);assert.equal(bytes.indexOf(Buffer.from(needle),at+1),-1,'fixture mutation must target one stored byte sequence');return at;}
test('independent LibreOffice BIFF8 formulas decode end to end through sanitized parser',async()=>{
 const bytes=source(),before=Buffer.from(bytes),s=(await read(bytes))[0];assert.deepEqual(bytes,before);
 assert.deepEqual(s.formulaRows.map(row=>row.slice(2)),[['SUM(A1:B1)','(A1*2)','{(A1:A3*2)}'],["(Rate+'Other'!A1)",'(A2*2)','{(A1:A3*2)}'],["('Data'!LocalRate+1)",'(A3*2)','{(A1:A3*2)}']]);
 assert.deepEqual(s.formulaComparisonCoverage,{supported:9,total:9,reasons:[]});assert.equal(s.capabilities.preserveSource,false);assert.equal(s.formulaIdentityRows[0][4]===s.formulaIdentityRows[1][4],false,'array member identity includes its result coordinate');
 const Excel=require('exceljs'),book=new Excel.Workbook();await book.xlsx.readFile(path.join(__dirname,'xls-formula-fixtures/readback.xlsx'));const reference=book.getWorksheet('Data');for(let row=0;row<3;row++)for(let col=2;col<5;col++){const cell=reference.getCell(row+1,col+1);assert.equal(Number(s.rows[row][col]),cell.result??cell.value);}
});
test('independent derived BIFF8 isolates changed expression from unchanged cache and vice versa',async()=>{
 const original=source(),census=preflightXls(original),decl=census.sheets[0].formulas.find(f=>f.row===1&&f.column===2),at=uniqueOffset(original,decl.tokens),left=(await read(original))[0];
 assert.equal(original.readUInt16LE(at-22),1);assert.equal(original.readUInt16LE(at-20),2);assert.equal(original.readDoubleLE(at-16),12);
 const expression=Buffer.from(original);assert.equal(expression[at+decl.tokens.length-1],3);expression[at+decl.tokens.length-1]=4;const right=(await read(expression))[0];
 assert.equal(left.rows[1][2],right.rows[1][2]);assert.notEqual(left.formulaIdentityRows[1][2],right.formulaIdentityRows[1][2]);assert.equal(compareSheetPair(left,right,{workbookMode:'formulas'}).status,'different');assert.equal(compareSheetPair(left,right).status,'same');
 const cache=Buffer.from(original);cache.writeDoubleLE(999,at-16);const cacheOnly=(await read(cache))[0];assert.equal(cacheOnly.rows[1][2],'999');assert.equal(left.formulaIdentityRows[1][2],cacheOnly.formulaIdentityRows[1][2]);assert.equal(compareSheetPair(left,cacheOnly,{workbookMode:'formulas'}).status,'same');assert.equal(compareSheetPair(left,cacheOnly).status,'different');
});
test('independent defined-name definition changes remain different with identical name and cache',async()=>{
 const original=source(),r=preflightXls(original),record=r.formulaContext.records.find(r=>r.id===0x18),at=uniqueOffset(original,record.data),changed=Buffer.from(original),tokenAt=at+record.data.length-7;
 assert.equal(changed[tokenAt],0x3a);changed.writeUInt16LE(1,tokenAt+3);const a=(await read(original))[0],b=(await read(changed))[0];
 assert.equal(a.formulaRows[1][2],b.formulaRows[1][2]);assert.equal(a.rows[1][2],b.rows[1][2]);assert.notEqual(a.formulaIdentityRows[1][2],b.formulaIdentityRows[1][2]);assert.equal(compareSheetPair(a,b,{workbookMode:'formulas'}).status,'different');
});
