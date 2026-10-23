'use strict';
module.exports=require('./single-byte-fixtures/profiles.json').profiles.map(({encoding,text,hex})=>({encoding,text:text.replace(/\r\n$/,''),bytes:Buffer.from(hex,'hex')}));
