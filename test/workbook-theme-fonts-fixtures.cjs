'use strict';
const Excel=require('exceljs'),Zip=require('jszip');
const keys=['major','minor','equivalent','literal','rich','rich-literal','none'];
const collection=(role,{latin='Aptos',jpan='Yu Gothic',reverse=false}={})=>`<a:${role}Font><a:latin typeface="${latin}"/><a:ea typeface=""/><a:cs typeface=""/>${(reverse?['Arab','Jpan']:['Jpan','Arab']).map(script=>`<a:font script="${script}" typeface="${script==='Jpan'?jpan:'Arial'}"/>`).join('')}</a:${role}Font>`;
async function fixture(side,{scriptOnly=false}={}){
 const book=new Excel.Workbook(),sheet=book.addWorksheet('Theme fonts');sheet.addRow(['id','value']);
 for(const key of keys){
  const themed={name:side?'stale-right':'stale-left',scheme:'major',size:11};
  const font=key==='minor'?{...themed,scheme:'minor'}:key==='equivalent'?{...themed,scheme:side?'minor':'major'}:key==='literal'||key==='rich-literal'?{name:'Explicit font',size:11}:key==='none'?{name:'Explicit font',size:11,...(side?{}:{scheme:'none'})}:themed;
  const cell=sheet.addRow([key,key.startsWith('rich')?{richText:[{text:'same',font}]}:'same']).getCell(2);
  if(!key.startsWith('rich'))cell.font=font;
 }
 const zip=await Zip.loadAsync(await book.xlsx.writeBuffer());let theme=await zip.file('xl/theme/theme1.xml').async('string');
 theme=theme.replace(/<a:fontScheme[\s\S]*?<\/a:fontScheme>/,`<a:fontScheme name="${side?'Other label':'Original label'}">${collection('major',{latin:side&&!scriptOnly?'Aptos Display':'Aptos',jpan:side&&scriptOnly?'Meiryo':'Yu Gothic'})}${collection('minor',{reverse:side})}</a:fontScheme>`);
 zip.file('xl/theme/theme1.xml',theme);return zip.generateAsync({type:'nodebuffer'});
}
async function invalidFixtures(original){
 const result={};for(const kind of ['duplicate-collection','duplicate-script','missing-latin','foreign-script','duplicate-font-scheme']){
  const zip=await Zip.loadAsync(original);let xml=await zip.file('xl/theme/theme1.xml').async('string');
  if(kind==='duplicate-collection')xml=xml.replace('</a:fontScheme>',collection('major')+'</a:fontScheme>');
  if(kind==='duplicate-script')xml=xml.replace('</a:majorFont>','<a:font script="Jpan" typeface="Other"/></a:majorFont>');
  if(kind==='missing-latin')xml=xml.replace('<a:latin typeface="Aptos"/>','');
  if(kind==='foreign-script')xml=xml.replace('</a:majorFont>','<x:font xmlns:x="urn:foreign" script="Latn" typeface="Other"/></a:majorFont>');
  if(kind==='duplicate-font-scheme')xml=xml.replace('</a:themeElements>','<a:fontScheme name="duplicate">'+collection('major')+collection('minor')+'</a:fontScheme></a:themeElements>');
  zip.file('xl/theme/theme1.xml',xml);result[kind]=await zip.generateAsync({type:'nodebuffer'});
 }return result;
}
module.exports={fixture,invalidFixtures};
