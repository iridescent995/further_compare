const {test}=require('node:test');const assert=require('node:assert/strict');
const {createFileContentReport:create,formatFileContentReport:format}=require('../src/file-content-report.cjs');
const pair=(a,b)=>({leftRoot:'/left',rightRoot:'/right',files:[{id:'one',pathA:'a.txt',pathB:'b.txt',left:a==null?null:{content:a,format:{encoding:'utf8',eol:'CRLF'}},right:b==null?null:{content:b,format:{encoding:'utf16le',eol:'LF'}}}]});
test('text report normalizes EOL, retains original line content and numbers and exposes formats',()=>{const report=create(pair('A\r\n B\r','a\nB\n'),{mode:'text-whitespace-case'});assert.equal(report.files[0].hunks.length,0);assert.equal(report.files[0].ignoredLineCount,2);assert.deepEqual(report.files[0].rows[1],{a:' B',b:'B',ai:1,bi:1,type:'equal',minor:true,rowIndex:1});assert.equal(report.files[0].left.format.eol,'CRLF');assert.match(report.method,/do not imply byte equality/);});
test('content and metadata rules preserve case and horizontal whitespace; blank lines and final newline retained',()=>{for(const mode of ['content','size','modified','size-modified','text-content'])assert.equal(create(pair(' A','a'),{mode}).files[0].status,'different');assert.equal(create(pair('a\n','a'),{mode:'text-whitespace'}).files[0].status,'different');assert.equal(create(pair('a\n\nb','a\nb'),{mode:'text-whitespace'}).files[0].status,'different');});
test('absent side remains distinct from present empty file',()=>{const report=create(pair(null,''));assert.equal(report.files[0].status,'right-only');assert.equal(report.files[0].left,null);assert.equal(report.files[0].rows.length,0);assert.match(format(report,'text'),/Absent/);assert.equal(create(pair('',null)).files[0].status,'left-only');assert.equal(create(pair('','')).files[0].status,'text-match');});
test('exports escape untrusted content and preserve full hunks and minor rows',()=>{const payload=pair('<script>x</script>\nsame','<img src=x>\nsame');payload.files[0].pathA='a<svg onload="bad">';const report=create(payload);const html=format(report,'html');assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x>'));assert.match(html,/&lt;script&gt;/);assert.match(html,/default-src 'none'/);const json=JSON.parse(format(report,'json',true));assert.equal(json.files[0].rows.length,1);assert.deepEqual(json.files[0].hunks,report.files[0].hunks);assert.equal(json.files[0].rows[0].a,'<script>x</script>');const minor=create(pair('a','A'),{mode:'text-case'});assert.equal(JSON.parse(format(minor,'json',true)).files[0].rows[0].minor,true);assert.throws(()=>format(report,'csv'),/Unsupported/);});
test('reports reject invalid inputs and aggregate limits without partial output',()=>{assert.throws(()=>create({files:[]}),/1 and 20/);assert.throws(()=>create({files:Array(21).fill(pair('a','b').files[0])}),/1 and 20/);assert.throws(()=>create(pair(null,null)),/at least one/);assert.throws(()=>create(pair('x\n'.repeat(25000),'x\n'.repeat(25000))),/50,000/);assert.throws(()=>create(pair('x'.repeat(20*1024*1024+1),'')),/20 MiB/);assert.throws(()=>create({files:[{left:{content:2}}]}),/decoded text/);});

test('filtered exports preserve stable row indexes for hunks',()=>{const report=create(pair('same\na\nlast','same\nb\nlast'));const filtered=JSON.parse(format(report,'json',true));assert.equal(filtered.files[0].rows[0].rowIndex,1);assert.equal(filtered.files[0].hunks[0].row,1);assert.match(filtered.rowIndexMeaning,/original all-lines/);});

test('selected file reports use precise whitespace scopes and preserve original lines',()=>{
 for(const [scope,a,b] of [['leading','  a b ','a b '],['trailing',' a b  ',' a b'],['edges','  a b  ','a b'],['embedded',' a  b ',' ab '],['leading-embedded','  a  b ','ab '],['trailing-embedded',' a  b  ',' ab']]){
  const report=create(pair(a,b),{mode:'text-whitespace',textWhitespaceScope:scope});
  assert.equal(report.files[0].hunks.length,0,scope);assert.equal(report.files[0].rows[0].a,a);assert.equal(report.files[0].rows[0].b,b);assert.equal(report.files[0].rows[0].minor,true);
  assert.equal(report.rules.textWhitespaceScope,scope);assert.match(report.method,/spaces\/tabs ignored/);assert.equal(JSON.parse(format(report,'json')).rules.textWhitespaceScope,scope);
 }
 assert.equal(create(pair(' a ','a'),{mode:'text-whitespace',textWhitespaceScope:'leading'}).files[0].status,'different');
 assert.equal(create(pair(' a ','a'),{mode:'text-whitespace',textWhitespaceScope:'embedded'}).files[0].status,'different');
 assert.throws(()=>create(pair('a','b'),{textWhitespaceScope:'unknown'}),/whitespace/i);
});

test('blank-line file reports preserve one-sided minor rows and absent line numbers',()=>{
 const report=create(pair('a\n \t\nb\n','a\nb\n'),{mode:'text-content',ignoreBlankLines:true});
 assert.equal(report.files[0].hunks.length,0);const minor=report.files[0].rows.find(row=>row.minor);assert.equal(minor.a,' \t');assert.equal(minor.b,null);assert.equal(minor.ai,1);assert.equal(minor.bi,null);
 assert.equal(report.rules.ignoreBlankLines,true);assert.match(report.method,/Final newline differences after nonblank text remain important/);
 const json=JSON.parse(format(report,'json',true));assert.equal(json.files[0].rows[0].bi,null);
 assert.match(format(report,'text',true),/equal \(minor\)\t2\t \t\t\|\t\t/);
 assert.equal(create(pair('a\n','a'),{mode:'text-content',ignoreBlankLines:true}).files[0].status,'different');
 assert.equal(create(pair('a\n\nb','a\nb'),{mode:'content',ignoreBlankLines:true}).files[0].status,'different');
});

test('ignored text reports require prepared keys and retain raw minor contents and rule metadata',()=>{
 const rules={mode:'text-content',ignoredTextPatterns:[{pattern:'id=\\d+',matchCase:true}]},payload=pair('id=12 value','id=34 value');
 assert.throws(()=>create(payload,rules),/worker-prepared/);
 const report=create(payload,rules,[{a:[' value'],b:[' value']}]);assert.equal(report.files[0].hunks.length,0);assert.equal(report.files[0].rows[0].a,'id=12 value');assert.equal(report.files[0].rows[0].b,'id=34 value');assert.equal(report.files[0].rows[0].minor,true);assert.deepEqual(report.rules.ignoredTextPatterns,rules.ignoredTextPatterns);
 for(const type of ['text','html','json'])assert.match(format(report,type),/id=/);
});
