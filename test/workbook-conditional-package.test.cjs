'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),JSZip=require('jszip'),{DOMParser,XMLSerializer}=require('@xmldom/xmldom');
const {prepareWorkbookPackage}=require('../src/workbook-package.cjs');
const options={DOMParser,XMLSerializer};
test('real x14 conditional formula extension remains readable without relaxing worksheet formula namespaces',async()=>{
 const original=await fs.readFile('test/fixtures/workbook-conditional/unsupported.xlsx'),copy=Buffer.from(original),result=await prepareWorkbookPackage(original,options);assert.equal(result.sheets.length,1);assert.deepEqual(original,copy);
 const zip=await JSZip.loadAsync(result.bytes),xml=await zip.file('xl/worksheets/sheet1.xml').async('string');assert.match(xml,/A2&gt;10|A2>10/);assert.match(xml,/office\/excel\/2006\/main/);
 const doc=new DOMParser().parseFromString(xml,'application/xml'),ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main',foreign=doc.createElementNS('http://schemas.microsoft.com/office/excel/2006/main','xm:f');foreign.appendChild(doc.createTextNode('123'));doc.getElementsByTagNameNS(ns,'c')[0].appendChild(foreign);zip.file('xl/worksheets/sheet1.xml',new XMLSerializer().serializeToString(doc));await assert.rejects(prepareWorkbookPackage(await zip.generateAsync({type:'uint8array'}),options),/Foreign spreadsheet cell namespace/);
});
test('foreign formula outside a recognized conditional extension cannot bypass package admission',async()=>{
 const zip=await JSZip.loadAsync(await fs.readFile('test/fixtures/workbook-conditional/baseline.xlsx')),doc=new DOMParser().parseFromString(await zip.file('xl/worksheets/sheet1.xml').async('string'),'application/xml');const foreign=doc.createElementNS('http://schemas.microsoft.com/office/excel/2006/main','xm:f');foreign.textContent='A1';doc.documentElement.appendChild(foreign);zip.file('xl/worksheets/sheet1.xml',new XMLSerializer().serializeToString(doc));await assert.rejects(prepareWorkbookPackage(await zip.generateAsync({type:'uint8array'}),options),/Foreign spreadsheet cell namespace/);
});
