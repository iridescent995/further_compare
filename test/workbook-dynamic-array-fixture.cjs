'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
async function dynamicWorkbook(){return fs.readFile(path.join(__dirname,'workbook-dynamic-fixture.xlsx'));}
async function dynamicInput(){return {name:'dynamic.xlsx',data:(await dynamicWorkbook()).toString('base64')};}
module.exports={dynamicWorkbook,dynamicInput};
