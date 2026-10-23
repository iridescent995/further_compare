'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateTextProfileMappings,detectTextProfile,resolveTextProfile}=require('../src/text-profile.cjs');
const {prepareComparisonKeys,comparisonPair}=require('../src/text-comparison-keys.cjs');
const {createFileContentReport,formatFileContentReport}=require('../src/file-content-report.cjs');
const {createFolderReport,formatFolderReport}=require('../src/folder-report.cjs');
const mappings=[{pattern:'*.generated.java',profile:'plain'},{pattern:'*.ddl',profile:'sql'},{pattern:'pom.?ml',profile:'xml'}];
test('ordered mappings override builtins and retain conservative pair agreement',()=>{
 assert.equal(detectTextProfile('/tmp/A.GENERATED.JAVA',mappings),'plain');
 assert.equal(detectTextProfile('C:\\tmp\\schema.DDL',mappings),'sql');
 assert.equal(detectTextProfile('pom.XML',mappings),'xml');
 assert.equal(detectTextProfile('normal.java',mappings),'java');
 assert.equal(resolveTextProfile('auto',['a.ddl','b.sql'],mappings),'sql');
 assert.equal(resolveTextProfile('auto',['a.ddl','b.xml'],mappings),'plain');
 assert.equal(resolveTextProfile('auto',['a.ddl',null],mappings),'sql');
 assert.equal(resolveTextProfile('java',['a.ddl','b.xml'],mappings),'java');
 assert.equal(detectTextProfile('a.java',[{pattern:'*',profile:'sql'},{pattern:'*.java',profile:'xml'}]),'sql');
 assert.equal(detectTextProfile('a.java',[{pattern:'*.java',profile:'xml'},{pattern:'*',profile:'sql'}]),'xml');
 for(const name of ['',null,{},'a/','a\\','a\0.sql','x'.repeat(1025)])assert.equal(detectTextProfile(name,[{pattern:'*',profile:'sql'}]),'plain');
});
test('mapping validation bounds configurations and clones canonical fields',()=>{
 const copy=validateTextProfileMappings(mappings);copy[0].pattern='*';assert.equal(mappings[0].pattern,'*.generated.java');
 for(const value of [null,{},new Array(1),Array(33).fill(mappings[0]),[{pattern:'',profile:'sql'}],[{pattern:'x'.repeat(129),profile:'sql'}],[{pattern:'dir/*.sql',profile:'sql'}],[{pattern:'dir\\*.sql',profile:'sql'}],[{pattern:'*.sql\n',profile:'sql'}],[{pattern:'*',profile:'auto'}],[{pattern:'*',profile:'sql',enabled:true}]])assert.throws(()=>validateTextProfileMappings(value));
 assert.equal(validateTextProfileMappings([{pattern:'x'.repeat(128),profile:'plain'}]).length,1);
});
test('glob matcher treats regex symbols literally and ? as one Unicode character',()=>{
 assert.equal(detectTextProfile('[a]+(b).ddl',[{pattern:'[a]+(b).*',profile:'sql'}]),'sql');
 assert.equal(detectTextProfile('ab.ddl',[{pattern:'[a]+(b).*',profile:'sql'}]),'plain');
 for(const name of ['😀.ddl','İ.ddl'])assert.equal(detectTextProfile(name,[{pattern:'?.ddl',profile:'sql'}]),'sql');
 // Independent exhaustive small oracle for star/one-character matching.
 function words(alphabet,n){let all=[''],level=[''];for(let i=0;i<n;i++){level=level.flatMap(x=>alphabet.map(y=>x+y));all.push(...level);}return all;}
 for(const pattern of words(['a','b','*','?'],3).filter(Boolean)){
  const regex=new RegExp('^'+pattern.replace(/\*/g,'.*').replace(/\?/g,'.')+'$','i');
  for(const name of words(['a','b'],4).filter(Boolean))assert.equal(detectTextProfile(name,[{pattern,profile:'sql'}]),regex.test(name)?'sql':'plain',`${pattern}: ${name}`);
 }
 const adversarial='*a'.repeat(63)+'*b';assert.equal(detectTextProfile('a'.repeat(1024),[{pattern:adversarial,profile:'sql'}]),'plain');
});
test('file and folder reports retain exact ordered mappings and effective profiles',()=>{
 const file={pathA:'a.ddl',pathB:'b.sql',left:{content:'-- old\nx\n'},right:{content:'x\n'}};
 const rules={mode:'text-content',textProfile:'auto',textProfileMappings:mappings};
 const prepared=comparisonPair(prepareComparisonKeys([file.left.content,file.right.content],[],resolveTextProfile('auto',[file.pathA,file.pathB],mappings)));
 const report=createFileContentReport({files:[file]},rules,[prepared]);
 assert.equal(report.files[0].resolvedTextProfile,'sql');assert.equal(report.files[0].hunks.length,0);assert.deepEqual(report.rules.textProfileMappings,mappings);
 const folder=createFolderReport({rules,entries:[{...file,kindA:'file',kindB:'file',status:'equal',comparison:'text-normalized'}]});assert.equal(folder.entries[0].resolvedTextProfile,'sql');assert.deepEqual(folder.rules.textProfileMappings,mappings);
 for(const format of ['json','text','html']){assert.ok(formatFileContentReport(report,format).includes('*.ddl'));assert.ok(formatFolderReport(folder,format).includes('*.ddl'));}
 assert.ok(formatFolderReport(folder,'csv').includes('*.ddl'));
 report.rules.textProfileMappings[0].pattern='changed';assert.equal(mappings[0].pattern,'*.generated.java');
 const dormant=createFileContentReport({files:[file]},{...rules,mode:'content'});assert.match(dormant.method,/retained, not applied/);assert.equal(dormant.files[0].resolvedTextProfile,'plain');
});
