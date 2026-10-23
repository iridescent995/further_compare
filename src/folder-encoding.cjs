'use strict';
function folderEncodings(rules={}){return {a:rules.textEncodingA??rules.textEncoding??'auto',b:rules.textEncodingB??rules.textEncoding??'auto'};}
function folderEncodingFields(rules={}){return Object.fromEntries(['textEncoding','textEncodingA','textEncodingB'].filter(key=>rules[key]!==undefined).map(key=>[key,rules[key]]));}
module.exports={folderEncodings,folderEncodingFields};
