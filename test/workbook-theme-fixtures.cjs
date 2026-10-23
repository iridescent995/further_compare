'use strict';
const Excel=require('exceljs'),Zip=require('jszip'),assert=require('node:assert/strict');
async function fixture(right){
 const book=new Excel.Workbook(),sheet=book.addWorksheet('Theme colors');sheet.addRow(['id','value']);
 for(const key of ['font','fill','border','rich','tint','equivalent','direct','plain','system','light-equivalent','dark-equivalent']){
  const cell=sheet.addRow([key,key==='rich'?{richText:[{text:'same',font:{color:{theme:4}}}]}:'same']).getCell(2);
  if(key==='font')cell.font={color:{theme:4}};
  if(key==='fill')cell.fill={type:'pattern',pattern:'solid',fgColor:{theme:4}};
  if(key==='border')cell.border={bottom:{style:'thin',color:{theme:4}}};
  if(key==='tint')cell.font={color:{theme:4,tint:0.4}};
  if(key==='equivalent')cell.font={color:{theme:right?5:4}};
  if(key==='system')cell.font={color:{theme:0}};
  if(key==='light-equivalent')cell.font={color:right?{argb:'FFFFFFFF'}:{theme:0}};
  if(key==='dark-equivalent')cell.font={color:right?{argb:'FF000000'}:{theme:1}};
  if(key==='direct')cell.font={color:right?{argb:'FF336699'}:{theme:4}};
 }
 const zip=await Zip.loadAsync(await book.xlsx.writeBuffer());let theme=await zip.file('xl/theme/theme1.xml').async('string');
 const set=(name,color)=>{const pattern=new RegExp('<a:'+name+'>[\\s\\S]*?</a:'+name+'>');assert.match(theme,pattern);theme=theme.replace(pattern,'<a:'+name+'><a:srgbClr val="'+color+'"/></a:'+name+'>');};set('accent1',right?'CC5533':'336699');set('accent2','336699');if(right)theme=theme.replace(/<a:lt1>[\s\S]*?<\/a:lt1>/,'<a:lt1><a:sysClr val="window" lastClr="DDDDDD"/></a:lt1>');
 if(right){zip.remove('xl/theme/theme1.xml');zip.file('xl/custom/palette colors.xml',theme);zip.file('xl/_rels/workbook.xml.rels',(await zip.file('xl/_rels/workbook.xml.rels').async('string')).replace('Target="theme/theme1.xml"','Target="custom/palette%20colors.xml"'));zip.file('[Content_Types].xml',(await zip.file('[Content_Types].xml').async('string')).replace('/xl/theme/theme1.xml','/xl/custom/palette%20colors.xml'));}else zip.file('xl/theme/theme1.xml',theme);
 return zip.generateAsync({type:'nodebuffer'});
}
async function invalidFixtures(){
 const original=await fixture(false),result={};
 for(const kind of ['external','malformed','missing']){
  const zip=await Zip.loadAsync(original);
  if(kind==='external')zip.file('xl/_rels/workbook.xml.rels',(await zip.file('xl/_rels/workbook.xml.rels').async('string')).replace('Target="theme/theme1.xml"','Target="https://example.invalid/theme.xml" TargetMode="External"'));
  if(kind==='malformed')zip.file('xl/theme/theme1.xml','<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><broken>');
  if(kind==='missing')zip.remove('xl/theme/theme1.xml');
  result[kind]=await zip.generateAsync({type:'nodebuffer'});
 }
 return result;
}
module.exports={fixture,invalidFixtures};
