'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DOMParser}=require('@xmldom/xmldom');
const {THEME_COLOR_NAMES,parseWorkbookTheme,resolveWorkbookThemeStyle}=require('../src/workbook-theme.cjs');
const {workbookStyleSignature}=require('../src/workbook-compare.cjs');
const colors={lt1:'FFFFFF',dk1:'000000',lt2:'EEECE1',dk2:'1F497D',accent1:'4F81BD',accent2:'C0504D',accent3:'9BBB59',accent4:'8064A2',accent5:'4BACC6',accent6:'F79646',hlink:'0000FF',folHlink:'800080'};
const xml=(values=colors)=>'<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme name="Test">'+['dk1','lt1','dk2','lt2',...THEME_COLOR_NAMES.slice(4)].map(name=>'<a:'+name+'>'+(name==='dk1'?'<a:sysClr val="windowText" lastClr="'+values[name]+'"/>':'<a:srgbClr val="'+values[name]+'"/>')+'</a:'+name+'>').join('')+'</a:clrScheme></a:themeElements></a:theme>';
const signature=(style,palette)=>workbookStyleSignature(resolveWorkbookThemeStyle(style,palette));
test('theme palette follows spreadsheet slot order independently of XML order',()=>{
 const result=parseWorkbookTheme(xml(),DOMParser);assert.deepEqual(result,THEME_COLOR_NAMES.map(name=>'FF'+colors[name]));assert.ok(Object.isFrozen(result));assert.deepEqual(parseWorkbookTheme(colors),result);
 assert.equal(result[0],'FFFFFFFF');assert.equal(result[1],'FF000000');assert.equal(result[2],'FFEEECE1');assert.equal(result[3],'FF1F497D');
});
test('all supported style color positions resolve without mutation',()=>{
 const color={theme:4,tint:0.25},style={font:{color},fill:{fgColor:color,bgColor:{theme:0},stops:[{position:0,color}]},border:{left:{color}},richText:[{text:'text',font:{color}}]},before=structuredClone(style),palette=parseWorkbookTheme(colors);
 const result=resolveWorkbookThemeStyle(style,palette);assert.deepEqual(style,before);assert.notEqual(result.font,style.font);assert.ok(Object.isFrozen(result.font.color));
 assert.deepEqual(result.font.color,{argb:'FF4F81BD',tint:0.25});assert.deepEqual(result.richText[0].font.color,result.font.color);assert.deepEqual(result.fill.stops[0].color,result.font.color);assert.deepEqual(result.border.left.color,result.font.color);
});
test('palette changes affect used styles while alias slots and equivalent explicit color compare equally',()=>{
 const palette=parseWorkbookTheme(colors),changed=parseWorkbookTheme({...colors,accent1:'FF0000'}),alias=parseWorkbookTheme({...colors,accent2:colors.accent1});
 const style={font:{color:{theme:4}}};assert.notEqual(signature(style,palette),signature(style,changed));
 assert.equal(signature(style,palette),signature({font:{color:{theme:5}}},alias));assert.equal(signature(style,palette),signature({font:{color:{argb:'ff4f81bd',tint:0}}},null));
 assert.equal(signature({font:{bold:true}},palette),signature({font:{bold:true}},changed));
});
test('tint remains a lossless HLS parameter rather than RGB interpolation',()=>{
 const palette=parseWorkbookTheme(colors);
 for(const tint of [-1,-0.375,0.5999938962981048,1])assert.deepEqual(resolveWorkbookThemeStyle({font:{color:{theme:4,tint}}},palette).font.color,{argb:'FF4F81BD',tint});
 assert.notEqual(signature({font:{color:{theme:4,tint:0.25}}},palette),signature({font:{color:{theme:4,tint:0.5}}},palette));
 for(const tint of [NaN,Infinity,2,-2,'0.5'])assert.throws(()=>resolveWorkbookThemeStyle({font:{color:{theme:4,tint}}},palette),/tint/);
});
test('missing and unsupported theme data fail explicitly',()=>{
 assert.equal(parseWorkbookTheme(null),null);assert.deepEqual(resolveWorkbookThemeStyle({font:{bold:true}},null),{font:{bold:true}});
 assert.throws(()=>resolveWorkbookThemeStyle({font:{color:{theme:4}}},null),/missing theme/);
 for(const theme of [-1,12,1.5,'4'])assert.throws(()=>resolveWorkbookThemeStyle({font:{color:{theme}}},parseWorkbookTheme(colors)),/index/);
 assert.throws(()=>parseWorkbookTheme({...colors,accent1:'INVALID'}),/RGB/);
 assert.throws(()=>parseWorkbookTheme(xml().replace('<a:srgbClr val="4F81BD"/>','<a:schemeClr val="accent2"/>'),DOMParser),/Unsupported/);
 assert.throws(()=>parseWorkbookTheme(xml().replace('<a:srgbClr val="4F81BD"/>','<a:srgbClr val="4F81BD"><a:tint val="1000"/></a:srgbClr>'),DOMParser),/Unsupported/);
 assert.throws(()=>parseWorkbookTheme('<!DOCTYPE x>'+xml(),DOMParser),/Unsupported/);
 assert.throws(()=>parseWorkbookTheme('x'.repeat(1024*1024+1),DOMParser),/oversized/);
});
test('style validation bounds recursion and rejects ambiguous colors',()=>{
 const palette=parseWorkbookTheme(colors),style={};style.self=style;assert.throws(()=>resolveWorkbookThemeStyle(style,palette),/circular/);
 assert.throws(()=>resolveWorkbookThemeStyle({font:{color:{theme:4,argb:'FF000000'}}},palette),/Ambiguous/);
 assert.throws(()=>resolveWorkbookThemeStyle({font:{color:{theme:4,unknown:true}}},palette),/Unsupported/);
 assert.throws(()=>resolveWorkbookThemeStyle({richText:[{text:'x'.repeat(1024*1024+1)}]},palette),/limits/);
});
