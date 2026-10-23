'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),Zip=require('jszip');
async function fixture(side='left'){return fs.readFile(path.join(__dirname,'ods-fixtures','fc-ods-'+side+'.ods'));}
async function malformed(){const zip=await Zip.loadAsync(await fixture());zip.file('content.xml','<!DOCTYPE x [<!ENTITY bad SYSTEM "file:///etc/passwd">]><x>&bad;</x>');return zip.generateAsync({type:'nodebuffer'});}
async function unavailable(){const zip=await Zip.loadAsync(await fixture());const xml=await zip.file('content.xml').async('string');if(!xml.includes('office:value="12"'))throw Error('Fixture changed');zip.file('content.xml',xml.replace('office:value="12"',''));return zip.generateAsync({type:'nodebuffer'});}
module.exports={fixture,malformed,unavailable};
