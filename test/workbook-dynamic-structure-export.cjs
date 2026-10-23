'use strict';
const assert=require('node:assert/strict'),{chromium}=require('@playwright/test'),{build}=require('esbuild'),Zip=require('jszip'),{DOMParser}=require('@xmldom/xmldom'),{createHash}=require('node:crypto'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const {dynamicWorkbook}=require('./workbook-dynamic-array-fixture.cjs');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),op=(axis,index,count=1,operation='insert')=>({axis,index,count,operation});
(async()=>{
 const original=await dynamicWorkbook(),originalHash=hash(original),originalZip=await Zip.loadAsync(original),outputDir=process.env.FC_DYNAMIC_OUTPUT_DIR||await fs.mkdtemp(path.join(os.tmpdir(),'fc-dynamic-export-'));
 const bundle=await build({stdin:{contents:"import {exportWorkbookCopy} from './src/workbook-preserve.js';window.save=exportWorkbookCopy;",resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife'}),browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  await fs.mkdir(outputDir,{recursive:true});const page=await browser.newPage();await page.addScriptTag({content:bundle.outputFiles[0].text});
  const run=(bytes,operations)=>page.evaluate(async({base64,sourceHash,operations})=>{try{return {bytes:Array.from(await window.save(base64,'Data',[],{structure:{version:1,side:'a',sheetName:'Data',sourceHash,sourceRows:4,sourceColumns:9,operations}}))};}catch(error){return {error:error.message};}},{base64:bytes.toString('base64'),sourceHash:hash(bytes),operations});
  const cells=xml=>{const doc=new DOMParser().parseFromString(xml,'application/xml');return new Map(Array.from(doc.getElementsByTagName('c')).map(cell=>[cell.getAttribute('r'),cell]));};
  const formula=cell=>cell.getElementsByTagName('f')[0];
  const verify=async(result,expected,name)=>{
   assert.ok(!result.error,result.error);const bytes=Buffer.from(result.bytes),zip=await Zip.loadAsync(bytes);
   for(const part of ['xl/metadata.xml','xl/_rels/workbook.xml.rels','[Content_Types].xml','xl/styles.xml','xl/theme/theme1.xml'])assert.deepEqual(await zip.file(part).async('nodebuffer'),await originalZip.file(part).async('nodebuffer'),part+' must remain byte-identical');
   for(const [sheetName,spec]of Object.entries(expected)){
    const map=cells(await zip.file('xl/worksheets/sheet'+(sheetName==='Data'?1:2)+'.xml').async('string'));
    const arrays={};for(const [address,cell]of map){const f=formula(cell);if(f?.getAttribute('t')==='array'){arrays[address]=f.getAttribute('ref');assert.equal(cell.getAttribute('cm'),'1');assert.equal(cell.getElementsByTagName('v').length,0,'Array cache retained at '+address);}}
    assert.deepEqual(arrays,spec.arrays);for(const [address,expression]of Object.entries(spec.formulas||{}))assert.equal(formula(map.get(address)).textContent,expression.slice(1));
   }
   const file=path.join(outputDir,name+'.xlsx'),manifest=path.join(outputDir,name+'.json');await fs.writeFile(file,bytes);await fs.writeFile(manifest,JSON.stringify(expected));if(process.env.FC_DYNAMIC_PYTHON)process.stdout.write(execFileSync(process.env.FC_DYNAMIC_PYTHON,[path.join(__dirname,'workbook-dynamic-fixture.py'),'verify',file,manifest],{encoding:'utf8'}));return zip;
  };
  const movedExpected={Data:{arrays:{D3:'D3:E5',G3:'G3',J3:'J3'},formulas:{D3:'=A3:B5*2',G3:'=_xlfn.UNIQUE(A3:A5)',J3:'=SUM(_xlfn.ANCHORARRAY(D3))'},values:{A3:2,B5:6}},Other:{arrays:{A1:'A1'},formulas:{A1:'=SUM(_xlfn.ANCHORARRAY(Data!D3))'}}};
  const moved=await verify(await run(original,[op('row',2),op('column',3)]),movedExpected,'moved');const movedCells=cells(await moved.file('xl/worksheets/sheet1.xml').async('string'));
  for(const address of ['D3','E3','D4','E4','D5','E5']){assert.equal(movedCells.get(address).getElementsByTagName('v').length,0);assert.ok(movedCells.get(address).getAttribute('s'));}
  // Cache types are test mutations of the producer package, never a new metadata schema.
  const mixedZip=await Zip.loadAsync(original);let mixedXml=await mixedZip.file('xl/worksheets/sheet1.xml').async('string');
  for(const [address,type,value]of [['C2','e','#VALUE!'],['D2','str','cached text'],['D3','b','1']]){const pattern=new RegExp('<c r="'+address+'"([^>]*)>([\\s\\S]*?)</c>');assert.ok(pattern.test(mixedXml));mixedXml=mixedXml.replace(pattern,(_,attrs,body)=>'<c r="'+address+'"'+attrs+' t="'+type+'">'+body.replace(/<v>[^<]*<\/v>/,'<v>'+value+'</v>')+'</c>');}
  mixedZip.file('xl/worksheets/sheet1.xml',mixedXml);const mixed=await mixedZip.generateAsync({type:'nodebuffer'});const mixedOut=await verify(await run(mixed,[op('row',2),op('column',3)]),movedExpected,'mixed-caches');const mixedCells=cells(await mixedOut.file('xl/worksheets/sheet1.xml').async('string'));for(const address of ['D3','E3','E4']){assert.equal(mixedCells.get(address).getElementsByTagName('v').length,0);assert.ok(!mixedCells.get(address).hasAttribute('t'));}
  await verify(await run(original,[op('column',3,2,'delete')]),{Data:{arrays:{D2:'D2',G2:'G2'},formulas:{D2:'=_xlfn.UNIQUE(A2:A4)',G2:'=SUM(_xlfn.ANCHORARRAY(#REF!))'},values:{A2:2,B4:6}},Other:{arrays:{A1:'A1'},formulas:{A1:'=SUM(_xlfn.ANCHORARRAY(Data!#REF!))'}}},'deleted-range');
  await verify(await run(original,[op('row',2,3,'delete')]),{Data:{arrays:{}},Other:{arrays:{A1:'A1'},formulas:{A1:'=SUM(_xlfn.ANCHORARRAY(Data!#REF!))'}}},'deleted-all');
  for(const operation of [op('row',3),op('column',4),op('row',2,1,'delete')])assert.match((await run(original,[operation])).error,/inside|part of|partial/i);
  const mutations=[['bad cm','xl/worksheets/sheet1.xml',s=>s.replace('cm="1"','cm="2"')],['vm','xl/worksheets/sheet1.xml',s=>s.replace('cm="1"','cm="1" vm="1"')],['count','xl/metadata.xml',s=>s.replace('<cellMetadata count="1">','<cellMetadata count="2">')],['type index','xl/metadata.xml',s=>s.replace('t="1" v="0"','t="2" v="0"')],['future index','xl/metadata.xml',s=>s.replace('t="1" v="0"','t="1" v="1"')],['namespace','xl/metadata.xml',s=>s.replace('2017/dynamicarray','2017/foreignarray')],['extension','xl/metadata.xml',s=>s.replace(/BDBB8CDC-FA1E-496E-A857-3C3F30C029C3/i,'AAAAAAAA-FA1E-496E-A857-3C3F30C029C3')],['relationship','xl/_rels/workbook.xml.rels',s=>s.replace('Target="metadata.xml"','Target="missing-metadata.xml"')]];
  for(const [label,part,transform]of mutations){const zip=await Zip.loadAsync(original),xml=await zip.file(part).async('string'),changed=transform(xml);assert.notEqual(changed,xml,'Fixture mutation missed '+label);zip.file(part,changed);const bytes=await zip.generateAsync({type:'nodebuffer'}),before=hash(bytes),result=await run(bytes,[op('row',2)]);assert.ok(result.error,label+' must be rejected');assert.equal(hash(bytes),before);assert.equal(result.bytes,undefined);}
  assert.equal(hash(original),originalHash);console.log('Dynamic arrays export passed: independent producer, shared metadata preserved, known/anchor-only moves, whole deletion, cache invalidation, dependent references and malformed/partial refusal. No calculation or Excel validation claimed.');
 }finally{await browser.close();if(!process.env.FC_DYNAMIC_OUTPUT_DIR)await fs.rm(outputDir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
