'use strict';
const Excel=require('exceljs'),Zip=require('jszip');
async function arrayWorkbook(){const book=new Excel.Workbook(),sheet=book.addWorksheet('Data'),other=book.addWorksheet('Other');sheet.addRows([['First','Second','Array','Result'],[2,3,4,6],[4,5,8,10]]);sheet.getCell('C2').font={bold:true};sheet.getCell('D3').numFmt='0.00';other.getCell('A1').value={formula:'SUM(Data!C2:D3)',result:28};const z=await Zip.loadAsync(await book.xlsx.writeBuffer());z.file('xl/worksheets/sheet1.xml',(await z.file('xl/worksheets/sheet1.xml').async('string')).replace(/(<c r="C2"[^>]*>)/,'$1<f t="array" ref="C2:D3" aca="1">A2:B3*2</f>'));return z.generateAsync({type:'nodebuffer'});}
module.exports={arrayWorkbook};
