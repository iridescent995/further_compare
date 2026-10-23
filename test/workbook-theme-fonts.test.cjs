'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DOMParser}=require('@xmldom/xmldom');
const {parseWorkbookThemeFonts,resolveWorkbookThemeStyle}=require('../src/workbook-theme.cjs');
const {workbookStyleSignature}=require('../src/workbook-compare.cjs');
const NS='http://schemas.openxmlformats.org/drawingml/2006/main';
const collection=(name,face='Aptos',scripts='<a:font script="Jpan" typeface="Yu Gothic"/><a:font script="Arab" typeface="Arial"/>')=>`<a:${name}><a:latin typeface="${face}"/><a:ea typeface=""/><a:cs typeface=""/>${scripts}</a:${name}>`;
const xml=(major=collection('majorFont','Aptos Display'),minor=collection('minorFont'))=>`<a:theme xmlns:a="${NS}"><a:themeElements><a:fontScheme name="Office">${major}${minor}</a:fontScheme></a:themeElements></a:theme>`;
const parse=text=>parseWorkbookThemeFonts(text,DOMParser);
const signature=(style,fonts)=>workbookStyleSignature(resolveWorkbookThemeStyle(style,null,fonts));
test('theme font parser retains both collections and sorted script definitions, independent of labels and namespace prefixes',()=>{
 const fonts=parse(xml());assert.equal(fonts.major.latin.typeface,'Aptos Display');assert.equal(fonts.minor.latin.typeface,'Aptos');assert.deepEqual(fonts.major.scripts,{Arab:'Arial',Jpan:'Yu Gothic'});
 for(const value of [fonts,fonts.major,fonts.major.latin,fonts.major.scripts])assert.ok(Object.isFrozen(value));
 assert.deepEqual(parse(xml().replaceAll('a:','d:').replace('xmlns:a','xmlns:d').replace('name="Office"','name="Other"')),fonts);
 assert.deepEqual(parse(xml().replaceAll(NS,'http://purl.oclc.org/ooxml/drawingml/main')),fonts);
 assert.deepEqual(parseWorkbookThemeFonts(new DOMParser().parseFromString(xml(),'application/xml')),fonts);
});
test('theme referenced font replaces stale explicit face and retains collection semantics in cell and rich text fonts',()=>{
 const fonts=parse(xml()),style={font:{name:'Stale',scheme:'major',bold:true,color:{argb:'ff001122'}},richText:[{text:'世界',font:{name:'Stale',scheme:'minor',italic:true}}]},before=structuredClone(style);
 const resolved=resolveWorkbookThemeStyle(style,null,fonts);
 assert.deepEqual(style,before);assert.equal(resolved.font.name,'Aptos Display');assert.equal(resolved.font.scheme,undefined);assert.equal(resolved.font.bold,true);assert.equal(resolved.font.color.argb,'FF001122');assert.equal(resolved.font.themeFont,fonts.major);
 assert.equal(resolved.richText[0].font.name,'Aptos');assert.equal(resolved.richText[0].font.themeFont,fonts.minor);assert.ok(Object.isFrozen(resolved.richText[0].font));
 assert.equal(signature(style,fonts),signature({...style,font:{...style.font,name:'Different stale face'}},fonts));
});
test('major, minor and supplemental font differences are compared only when referenced',()=>{
 const a=parse(xml()),b=parse(xml(collection('majorFont','Different'))),c=parse(xml(undefined,collection('minorFont','Aptos','<a:font script="Jpan" typeface="Different"/><a:font script="Arab" typeface="Arial"/>')));
 assert.notEqual(signature({font:{scheme:'major'}},a),signature({font:{scheme:'major'}},b));
 assert.equal(signature({font:{scheme:'minor'}},a),signature({font:{scheme:'minor'}},b));
 assert.notEqual(signature({font:{scheme:'minor'}},a),signature({font:{scheme:'minor'}},c));
 assert.equal(signature({font:{name:'Explicit'}},a),signature({font:{name:'Explicit'}},b));
 assert.equal(signature({font:{scheme:'major'}},parse(xml(collection('majorFont','Same'),collection('minorFont','Same')))),signature({font:{scheme:'minor'}},parse(xml(collection('majorFont','Same'),collection('minorFont','Same')))));
});
test('missing fonts keep scheme unresolved; none means explicit unthemed font',()=>{
 assert.equal(parseWorkbookThemeFonts(null),null);assert.equal(parse(`<a:theme xmlns:a="${NS}"><a:themeElements/></a:theme>`),null);
 const style={font:{name:'Fallback',scheme:'minor'}};assert.deepEqual(resolveWorkbookThemeStyle(style,null),style);
 assert.equal(signature({font:{name:'Explicit',scheme:'none'}},parse(xml())),signature({font:{name:'Explicit'}},null));
 assert.throws(()=>resolveWorkbookThemeStyle({font:{scheme:'bogus'}},null),/scheme/);
});
test('font metadata has canonical hex and signed byte values with defaults normalized',()=>{
 const a=parse(xml().replace('<a:latin typeface="Aptos"/>','<a:latin typeface="Aptos" panose="020f0502020204030204" pitchFamily="+034" charset="-128"/>'));
 assert.deepEqual(a.minor.latin,{typeface:'Aptos',panose:'020F0502020204030204',pitchFamily:34,charset:-128});
 assert.deepEqual(parse(xml().replaceAll('typeface=""','typeface="" pitchFamily="0" charset="1"')),parse(xml()));
});
test('malformed or ambiguous theme fonts are rejected instead of silently compared as equal',()=>{
 const base=xml();for(const bad of [
  base.replace('<a:fontScheme','<evil:fontScheme xmlns:evil="urn:foreign"').replace('</a:fontScheme>','</evil:fontScheme>'),
  base.replace('<a:minorFont>','<a:minorFont><a:latin typeface="Duplicate"/>'),
  base.replace('</a:minorFont>','<a:font script="Jpan" typeface="Duplicate"/></a:minorFont>'),
  base.replace('<a:ea typeface=""/>','<a:ea/>'),
  base.replace('<a:ea typeface=""/>','<a:ea typeface="" unknown="x"/>'),
  base.replace('<a:ea typeface=""/>','<a:ea typeface="" panose="abc"/>'),
  base.replace('<a:ea typeface=""/>','<a:ea typeface="" charset="128"/>'),
  base.replace('<a:ea typeface=""/>','<a:ea typeface="" pitchFamily="1.5"/>'),
  base.replace('<a:ea typeface=""/>','<a:ea typeface="">content</a:ea>'),
  base.replace('<a:ea typeface=""/>','<foreign:ea xmlns:foreign="urn:foreign" typeface=""/>'),
  base.replace('script="Jpan"','script="__proto__"'),
  base.replace('<a:majorFont>','<a:majorFont><a:extLst/>'),
  base.replace('<a:minorFont>','<a:minorFont extra="x">'),
  base.replace('</a:fontScheme>','<a:majorFont/></a:fontScheme>'),
  base.replace('</a:themeElements>','<a:fontScheme/></a:themeElements>'),
  base.replace('</a:minorFont>',''),
  '<!DOCTYPE theme>'+base,
  base.replace('Aptos Display','x'.repeat(1025)),
  xml(collection('majorFont','Aptos',Array.from({length:257},(_,i)=>`<a:font script="Script${i}" typeface="x"/>`).join(''))),
 ])assert.throws(()=>parse(bad),undefined,bad.slice(0,180));
 assert.throws(()=>parse('x'.repeat(1024*1024+1)),/oversized/);
});
test('preparsed DOM and third argument descriptors are validated and bounded',()=>{
 const doc=new DOMParser().parseFromString(xml(),'application/xml');doc.documentElement.setAttribute('large','x'.repeat(1024*1024+1));assert.throws(()=>parseWorkbookThemeFonts(doc),/limits/);
 for(const bad of [{},[],{major:{},minor:{}},JSON.parse('{"major":{"__proto__":{}},"minor":{}}')])assert.throws(()=>resolveWorkbookThemeStyle({},null,bad),/font/);
 const copy=structuredClone(parse(xml()));copy.minor.latin.typeface='Changed';assert.equal(resolveWorkbookThemeStyle({font:{scheme:'minor'}},null,copy).font.name,'Changed');
 copy.minor.latin.typeface='Later';assert.equal(resolveWorkbookThemeStyle({font:{scheme:'minor'}},null,copy).font.name,'Later');
});
