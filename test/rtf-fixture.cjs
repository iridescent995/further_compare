'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const expected='Header\nCafé Ω中🚀\nValue LEFT\nTail\n';
async function authentic(){return fs.readFile(path.join(__dirname,'rtf-fixtures/textutil.rtf'));}
function adversarial(){return Buffer.concat([Buffer.from(String.raw`{\rtf1\ansi\ansicpg1252\uc1{\fonttbl{\f0 Arial;}}{\info{\title PRIVATE}}{\header SECRET}{\*\unknown Hidden {nested}}Visible \'80 \u937?\u-10179?\u-8576?\par {\field{\*\fldinst HYPERLINK "https://example.invalid/secret"}{\fldrslt Link}}\tab cell\cell end\par {\v HIDDEN}{\deleted REMOVED}{\pict\bin5 `,'ascii'),Buffer.from([123,92,125,0,255]),Buffer.from('}After}','ascii')]);}
module.exports={authentic,expected,adversarial,adversarialExpected:'Visible € Ω🚀\nLink\tcell\tend\nAfter'};
