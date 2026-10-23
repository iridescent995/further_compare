'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createFolderReport,formatFolderReport} = require('../src/folder-report.cjs');
const file = (path,status,comparison) => ({path,kindA:'file',kindB:'file',sizeA:0,sizeB:2,mtimeA:0,mtimeB:1000,status,comparison});
test('selected reports retain explicit scope and do not imply recursive directory coverage',()=>{
 const report=createFolderReport({scope:'selected',scan:{state:'complete'},entries:[file('chosen.txt','changed','content'),{path:'folder',kindA:'directory',kindB:'directory',status:'directory'}]});
 assert.equal(report.scope,'selected');assert.equal(report.statistics.entries,2);assert.equal(report.statistics.files,1);
 assert.match(report.notes,/Selected directories do not include descendants/);
 for(const format of ['html','csv','text','json']){const output=formatFolderReport(report,format);assert.match(output,/selected/);assert.match(output,/Selected directories do not include descendants/);}
});
test('folder reports distinguish verified and metadata matches, missing sizes, and pending provenance',()=>{
 const report=createFolderReport({entries:[file('a','equal','content'),file('b','equal','metadata'),file('c','equal'),file('d','mystery'),file('e','changed','content'),{path:'f',kindA:'file',sizeA:0,status:'left'},{path:'g',kindB:'file',status:'right'},{path:'dir',kindA:'directory',kindB:'directory',status:'directory'},{path:'type',kindA:'directory',kindB:'file',sizeB:4,status:'conflict'}]});
 assert.equal(report.statistics.files,8);assert.equal(report.statistics.directories,2);assert.equal(report.statistics.contentMatches,1);assert.equal(report.statistics.metadataMatches,1);assert.equal(report.statistics.pending,1);assert.equal(report.statistics.unknown,1);assert.equal(report.statistics.different,1);assert.equal(report.statistics.leftOnly,1);assert.equal(report.statistics.rightOnly,1);assert.equal(report.statistics.conflicts,1);assert.equal(report.statistics.leftBytes,0);assert.equal(report.statistics.rightBytes,14);assert.equal(report.statistics.rightUnknownSizes,1);
 assert.equal(report.entries[0].mtimeA,'1970-01-01T00:00:00.000Z');assert.equal(report.entries[5].sizeA,0);assert.equal(report.entries[5].sizeB,null);assert.equal(report.entries[6].sizeB,null);
});
test('folder reports explicitly preserve partial scan scope and filters, never infer completeness',()=>{
 const report=createFolderReport({scope:'visible',scan:{state:'partial',skipped:3,nodes:4,entries:7},filters:{query:'abc',exclude:'*.tmp'},rules:{mode:'size-modified',timeToleranceMs:2000},generatedAt:'2026-01-01T12:00:00+05:30',entries:[file('a','equal','content')]});
 assert.equal(report.generatedAt,'2026-01-01T06:30:00.000Z');assert.equal(report.scan.state,'partial');assert.equal(report.scope,'visible');assert.equal(report.scan.skipped,3);assert.equal(report.rules.timeToleranceMs,2000);assert.equal(report.filters.exclude,'*.tmp');
 assert.equal(createFolderReport({entries:[file('a','equal','content')]}).scan.state,'loaded');
 for(const format of ['html','csv','text','json']){const output=formatFolderReport(report,format);assert.match(output,/partial/);assert.match(output,/visible/);assert.match(output,/size-modified/);assert.match(output,/abc/);}
});
test('HTML escapes root, path and filter payloads and has no executable resources',()=>{
 const payload='<script>alert("&")</script>';
 const report=createFolderReport({left:{path:payload},right:payload,filters:{query:payload},entries:[file(payload,'changed','content')]});
 const html=formatFolderReport(report,'html');assert.ok(!html.includes(payload));assert.match(html,/&lt;script&gt;/);assert.ok(!/<script|\son\w+=|<link|<iframe/i.test(html));assert.match(html,/Further Compare/);
});
test('CSV quotes commas, quotes and line breaks, neutralizes formulas and keeps numeric zero',()=>{
 const names=['=SUM(1,2)','+cmd','-cmd','@cmd',' \t=cmd','\r=cmd','\u0001=cmd','a,"b"\nc'];
 const report=createFolderReport({left:'=ROOT()',entries:names.map(name=>file(name,'equal','content'))});
 const csv=formatFolderReport(report,'csv');
 for(const name of names.slice(0,-1))assert.ok(csv.includes('"\''+name.replace(/"/g,'""')+'"'));
 assert.ok(csv.includes('"a,""b""\nc"'));assert.ok(csv.includes('"\'=ROOT()"'));assert.match(csv,/,0,"1970-/);assert.ok(!csv.includes("'0"));assert.ok(csv.endsWith('\r\n'));
});
test('empty reports remain explicit and invalid status never creates a verified match',()=>{
 const empty=createFolderReport();assert.equal(empty.statistics.entries,0);assert.equal(empty.scan.state,'loaded');assert.equal(empty.scope,'loaded');
 for(const type of ['json','html','csv','text'])assert.ok(formatFolderReport(empty,type).length);
 assert.deepEqual(JSON.parse(formatFolderReport(empty,'json')),empty);
 assert.throws(()=>formatFolderReport(empty,'xml'),/Unsupported/);
 const row=createFolderReport({entries:[{...file('x','equal','content'),kindB:null}]}).entries[0];assert.equal(row.status,'unchecked');
});
test('normalized text matches remain separate from exact and metadata matches in every report format',()=>{
 const report=createFolderReport({rules:{mode:'text-whitespace'},entries:[file('exact.txt','equal','content'),file('metadata.txt','equal','metadata'),file('relaxed.txt','equal','text-normalized'),file('changed.txt','changed','text-normalized'),file('binary.bin','changed','content'),file('pending.txt','equal','pending')]});
 assert.equal(report.rules.mode,'text-whitespace');
 assert.equal(report.statistics.contentMatches,1);assert.equal(report.statistics.metadataMatches,1);assert.equal(report.statistics.normalizedTextMatches,1);assert.equal(report.statistics.different,2);assert.equal(report.statistics.pending,1);
 assert.equal(report.entries[3].comparison,'text-normalized');assert.equal(report.entries[3].status,'changed');assert.equal(report.entries[4].comparison,'content');
 const json=JSON.parse(formatFolderReport(report,'json'));assert.deepEqual(json.statistics,report.statistics);assert.equal(json.rules.mode,'text-whitespace');assert.equal(json.entries[2].comparison,'text-normalized');assert.equal(json.entries[3].comparison,'text-normalized');
 for(const format of ['html','csv','text']){
  const output=formatFolderReport(report,format);
  assert.match(output,/text-whitespace/);assert.match(output,/Text match \(whitespace ignored\)/);assert.match(output,/1 content matches/);assert.match(output,/1 metadata matches/);assert.match(output,/1 text matches \(whitespace ignored\)/);assert.match(output,/2 different/);
 }
 for(const format of ['html','csv','text','json']){
  const output=formatFolderReport(report,format);
  assert.match(output,/spaces, tabs and line-ending styles/);assert.match(output,/retain blank lines and the final newline/);assert.match(output,/do not imply byte-identical/);assert.match(output,/Binary, undecodable and files over 10 MiB fall back to exact content comparison/);
 }
 const html=formatFolderReport(report,'html');assert.match(html,/<tr class="equal text-normalized-match"><td>relaxed.txt/);assert.match(html,/<tr class="equal metadata-match"><td>metadata.txt/);assert.match(html,/<tr class="equal"><td>exact.txt/);assert.match(html,/<tr class="changed"><td>changed.txt<\/td><td>changed.txt<\/td><td>Different<\/td><td>text-normalized/);
});
test('normalized provenance cannot turn directories or missing counterparts into text matches',()=>{
 const report=createFolderReport({entries:[{...file('dir','equal','text-normalized'),kindA:'directory',kindB:'directory'},{...file('missing','equal','text-normalized'),kindB:null}]});
 assert.equal(report.statistics.normalizedTextMatches,0);assert.equal(report.statistics.contentMatches,0);assert.equal(report.statistics.metadataMatches,0);assert.deepEqual(report.entries.map(row=>row.status),['unchecked','unchecked']);
});
for(const [mode,label,description]of [
 ['text-case','Text match (case ignored)',/ignore letter case and line-ending styles, but retain spaces, tabs, blank lines and the final newline/],
 ['text-whitespace-case','Text match (whitespace and case ignored)',/ignore spaces, tabs, letter case and line-ending styles, but retain blank lines and the final newline/]
])test(`${mode} reports preserve rule-specific text match provenance in every format`,()=>{
 const rules={mode,timeToleranceMs:0},report=createFolderReport({rules,entries:[file('relaxed.txt','equal','text-normalized'),file('exact.txt','equal','content'),file('different.txt','changed','text-normalized'),file('binary.bin','changed','content')]});
 // A later preference change cannot relabel an already captured report.
 rules.mode='text-whitespace';assert.equal(report.rules.mode,mode);
 assert.equal(report.statistics.normalizedTextMatches,1);assert.equal(report.statistics.contentMatches,1);assert.equal(report.statistics.different,2);assert.equal(report.statistics.metadataMatches,0);
 const json=JSON.parse(formatFolderReport(report,'json'));assert.equal(json.rules.mode,mode);assert.equal(json.entries[0].comparison,'text-normalized');assert.equal(json.entries[1].comparison,'content');assert.equal(json.entries[2].comparison,'text-normalized');assert.equal(json.entries[3].comparison,'content');assert.match(json.notes,description);
 for(const format of ['text','csv','html']){
  const output=formatFolderReport(report,format);assert.ok(output.includes(mode));assert.ok(output.includes(label));assert.ok(output.includes('1 '+label.replace('Text match','text matches')));assert.match(output,/1 content matches/);assert.match(output,/2 different/);assert.match(output,description);
  assert.ok(!output.includes('Text match (whitespace ignored)'));assert.ok(!output.includes('text matches (whitespace ignored)'));
 }
 for(const format of ['json','text','csv','html']){
  const output=formatFolderReport(report,format);assert.match(output,/do not imply byte-identical files/);assert.match(output,/Binary, undecodable and files over 10 MiB fall back to exact content comparison/);
 }
 const html=formatFolderReport(report,'html');assert.ok(html.includes(`<tr class="equal text-normalized-match"><td>relaxed.txt</td><td>relaxed.txt</td><td>${label}</td><td>text-normalized</td>`));assert.match(html,/<tr class="equal"><td>exact.txt<\/td><td>exact.txt<\/td><td>Content match<\/td><td>content/);
});
test('report preview helpers use captured rule semantics, including retained whitespace in case-only mode',()=>{
 const {normalizedTextLabel,folderRuleDescription,statusLabel}=require('../src/folder-report.cjs');
 assert.equal(normalizedTextLabel('text-case'),'Text match (case ignored)');assert.equal(normalizedTextLabel('text-whitespace-case',true),'text matches (whitespace and case ignored)');assert.equal(normalizedTextLabel('text-whitespace'),'Text match (whitespace ignored)');
 assert.match(folderRuleDescription('text-case'),/Case and line-ending styles ignored; spaces, tabs, blank lines and final newline retained/);
 assert.match(folderRuleDescription('text-whitespace-case'),/Spaces, tabs, case and line-ending styles ignored; blank lines and final newline retained/);
 assert.equal(statusLabel(file('a','equal','text-normalized'),'text-case'),'Text match (case ignored)');assert.equal(statusLabel(file('a','equal','content'),'text-case'),'Content match');assert.equal(statusLabel(file('a','changed','text-normalized'),'text-case'),'Different');
 assert.equal(statusLabel(file('a','equal','text-normalized'),'content'),'Text match (normalized comparison)');
});

test('aligned reports preserve both actual paths and one logical count, including missing counterparts',()=>{
 const report=createFolderReport({alignment:[{a:'old/name.txt',b:'new/other.txt',kind:'file'}],entries:[
  {id:'opaque-never-a-path',parentId:'root',pathA:'old/name.txt',pathB:'new/other.txt',nameA:'name.txt',nameB:'other.txt',kindA:'file',kindB:'file',status:'equal',comparison:'content',sizeA:3,sizeB:3},
  {id:'missing-id',parentId:'root',pathA:null,pathB:'right-only.txt',kindA:null,kindB:'file',status:'right',sizeB:2}
 ]});
 assert.equal(report.statistics.entries,2);assert.equal(report.statistics.files,2);assert.equal(report.statistics.contentMatches,1);assert.equal(report.statistics.rightOnly,1);
 assert.equal(report.statistics.leftBytes,3);assert.equal(report.statistics.rightBytes,5);
 assert.equal(report.entries[0].manuallyAligned,true);assert.equal(report.entries[0].path,undefined);assert.equal(report.entries[1].pathA,null);
 assert.equal(report.entries[0].nameB,'other.txt');
 for(const format of ['json','text','csv','html']){const output=formatFolderReport(report,format);assert.ok(output.includes('old/name.txt'));assert.ok(output.includes('new/other.txt'));assert.ok(output.includes('right-only.txt'));assert.ok(!output.includes('opaque-never-a-path'));assert.ok(!output.includes('missing-id'));}
 for(const format of ['text','csv','html']){const output=formatFolderReport(report,format);assert.ok(output.includes('Left path'));assert.ok(output.includes('Right path'));assert.ok(output.includes('Manual alignments'));}
});
test('aligned path payloads are escaped independently in HTML and CSV',()=>{
 const report=createFolderReport({entries:[{id:'id',parentId:'root',pathA:'<img src=x onerror=alert(1)>',pathB:'=HYPERLINK("x")',kindA:'file',kindB:'file',status:'changed'}]});
 assert.ok(!formatFolderReport(report,'html').includes('<img'));assert.match(formatFolderReport(report,'html'),/&lt;img/);
 assert.ok(formatFolderReport(report,'csv').includes('"\'=HYPERLINK(""x"")"'));
 const legacy=createFolderReport({entries:[file('same.txt','equal','content')]});assert.equal(legacy.entries[0].path,'same.txt');assert.equal(legacy.entries[0].pathA,'same.txt');assert.equal(legacy.entries[0].pathB,'same.txt');
});

test('text-content reports preserve encoding-only match semantics in every format',()=>{
 const report=createFolderReport({rules:{mode:'text-content'},entries:[file('a','equal','text-normalized')]});
 assert.equal(report.rules.mode,'text-content');assert.match(report.notes,/retain case, spaces, tabs, blank lines and final newline/);
 for(const format of ['json','text','csv','html']){
  const output=formatFolderReport(report,format);assert.match(output,/text-content/);assert.match(output,/encoding/);
 }
});

test('report records explicit folder visibility alongside status filtering',()=>{const report=createFolderReport({filters:{status:'same',alwaysShowFolders:true},entries:[]});assert.equal(report.filters.alwaysShowFolders,true);assert.match(formatFolderReport(report,'text'),/Always show folders: Yes/);assert.equal(createFolderReport({}).filters.alwaysShowFolders,false);});

test('ignored reports retain actual results and provenance without counting exclusions as matches',()=>{
 const originals=[file('changed.txt','changed','content'),file('normalized.txt','equal','text-normalized'),file('metadata.txt','equal','metadata'),{path:'only.txt',kindA:'file',status:'left',sizeA:7},{path:'directory',kindA:'directory',kindB:'directory',status:'directory'}];
 const entries=originals.map(row=>({...row,actualStatus:row.status,status:'ignored',ignored:true}));
 const report=createFolderReport({rules:{mode:'text-case'},entries:[...entries,file('included.txt','equal','content')]});
 assert.equal(report.statistics.ignored,5);assert.equal(report.statistics.statuses.ignored,5);assert.equal(report.statistics.contentMatches,1);assert.equal(report.statistics.normalizedTextMatches,0);assert.equal(report.statistics.metadataMatches,0);assert.equal(report.statistics.different,0);assert.equal(report.statistics.leftOnly,0);
 assert.equal(report.statistics.files,5);assert.equal(report.statistics.directories,1);assert.equal(report.statistics.leftBytes,7);assert.equal(report.statistics.rightBytes,8);
 assert.deepEqual(report.entries.slice(0,5).map(row=>row.actualStatus),originals.map(row=>row.status));
 assert.equal(report.entries[0].comparison,'content');assert.equal(report.entries[1].comparison,'text-normalized');assert.equal(report.entries[2].comparison,'metadata');
 const json=JSON.parse(formatFolderReport(report,'json'));assert.deepEqual(json.entries,report.entries);assert.equal(json.entries[5].ignored,undefined);
 for(const format of ['html','text','csv']){
  const output=formatFolderReport(report,format);assert.match(output,/5 ignored/);assert.match(output,/Ignored \(actual result: Different\)/);assert.match(output,/Ignored \(actual result: Text match \(case ignored\)\)/);assert.match(output,/Ignored \(actual result: Metadata match \(contents unverified\)\)/);assert.match(output,/Ignored \(actual result: Left only\)/);assert.match(output,/Ignored \(actual result: Directory\)/);assert.match(output,/Ignoring does not imply a match/);
 }
 assert.match(formatFolderReport(report,'html'),/<tr class="ignored">/);
 assert.equal(originals[0].status,'changed');assert.equal(entries[0].actualStatus,'changed');
});
test('ignored reports cannot manufacture verified provenance or recurse through invalid actual statuses',()=>{
 const report=createFolderReport({entries:[{...file('pending','ignored'),ignored:true,actualStatus:'equal'},{...file('directory','ignored','content'),kindA:'directory',kindB:'directory',actualStatus:'equal'},file('unknown','ignored','content'),{...file('recursive','ignored','content'),actualStatus:'ignored'},{...file('flagged','changed','content'),ignored:true}]});
 assert.deepEqual(report.entries.map(row=>row.actualStatus),['unchecked','unchecked','unknown','unknown','changed']);
 assert.equal(report.statistics.ignored,5);assert.equal(report.statistics.contentMatches,0);assert.equal(report.statistics.pending,0);
 const output=formatFolderReport(report,'text');assert.match(output,/Ignored \(actual result: Pending\)/);assert.match(output,/Ignored \(actual result: Unknown\)/);assert.match(output,/Ignored \(actual result: Different\)/);
});

test('filename reports retain actual paths and disclose automatic matching separately from manual pairs',()=>{const report=createFolderReport({matchingMode:'filename',entries:[{pathA:'old/file.txt',pathB:'new/file.txt',kindA:'file',kindB:'file',sizeA:1,sizeB:1,status:'changed',comparison:'content'}]});assert.equal(report.matchingMode,'filename');assert.equal(report.entries[0].pathA,'old/file.txt');assert.equal(report.entries[0].pathB,'new/file.txt');assert.equal(report.entries[0].manuallyAligned,false);for(const format of ['text','html','csv'])assert.match(formatFolderReport(report,format),/Filename across folders/);});
test('folder reports preserve explicit decoding in every export and default old reports to auto',()=>{
 const report=createFolderReport({rules:{mode:'text-case',textEncoding:'windows1251'},entries:[file('legacy.txt','equal','text-normalized')]});
 assert.equal(report.rules.textEncoding,'windows1251');
 for(const format of ['html','csv','text','json'])assert.match(formatFolderReport(report,format),/windows1251/);
 assert.equal(createFolderReport({rules:{textEncoding:'invented'}}).rules.textEncoding,undefined);
 assert.match(formatFolderReport(createFolderReport({}), 'text'),/Text encoding: auto/);
});
test('folder reports disclose both side overrides including auto over a shared legacy encoding',()=>{
 const report=createFolderReport({rules:{mode:'text-content',textEncoding:'windows1251',textEncodingA:'utf16le',textEncodingB:'auto'}});
 assert.equal(report.rules.textEncodingA,'utf16le');assert.equal(report.rules.textEncodingB,'auto');
 for(const format of ['text','csv','html']){const value=formatFolderReport(report,format);assert.match(value,/Left text encoding/);assert.match(value,/Right text encoding/);assert.match(value,/utf16le/);}
 assert.deepEqual(JSON.parse(formatFolderReport(report,'json')).rules,report.rules);
 const invalid=createFolderReport({rules:{textEncodingA:'invented',textEncodingB:42}});assert.equal(invalid.rules.textEncodingA,undefined);assert.equal(invalid.rules.textEncodingB,undefined);
});
test('Unix metadata differences survive report exports without implying changed content',()=>{
 const report=createFolderReport({rules:{mode:'content',comparePermissions:true,compareOwner:true,compareGroup:false},entries:[{...file('same.txt','changed','content'),contentStatus:'equal',metadataDifferences:['permissions','owner']},{path:'dir',kindA:'directory',kindB:'directory',status:'changed',contentStatus:'directory',metadataDifferences:['permissions']}]});
 assert.equal(report.rules.comparePermissions,true);assert.equal(report.rules.compareOwner,true);assert.equal(report.rules.compareGroup,undefined);assert.equal(report.statistics.different,2);assert.equal(report.statistics.contentMatches,0);assert.equal(report.entries[0].contentStatus,'equal');assert.deepEqual(report.entries[0].metadataDifferences,['permissions','owner']);
 for(const format of ['text','csv','html']){const output=formatFolderReport(report,format);assert.match(output,/permissions, owner \(file comparison matches\)/);assert.match(output,/Permissions, Owner \(UID\)/);assert.match(output,/do not imply that file contents differ/);}
 assert.match(formatFolderReport(report,'json'),/"contentStatus": "equal"/);
});

test('folder reports capture automatic refresh timing and manual recursive scope',()=>{
 const off=createFolderReport({filters:{refreshIntervalMs:0}});
 assert.equal(off.filters.refreshIntervalMs,0);assert.match(formatFolderReport(off,'text'),/Automatic refresh: Off/);
 const periodic=createFolderReport({filters:{refreshIntervalMs:30000}});
 assert.equal(periodic.filters.refreshIntervalMs,30000);assert.match(formatFolderReport(periodic,'html'),/Every 30 seconds/);assert.match(formatFolderReport(periodic,'text'),/recursive and filename views use manual refresh/);
 assert.equal(createFolderReport({}).filters.refreshIntervalMs,1500);
});

test('timestamp exceptions survive report exports and preserve original displayed dates',()=>{
 const a=Date.UTC(2026,0,1,12),b=a+3600000;
 const report=createFolderReport({rules:{mode:'modified',timeToleranceMs:2000,ignoreDaylightSaving:true,ignoreTimezone:true},entries:[{...file('clock.txt','equal','metadata'),mtimeA:a,mtimeB:b}]});
 assert.equal(report.rules.ignoreDaylightSaving,true);assert.equal(report.rules.ignoreTimezone,true);assert.equal(report.rules.timeToleranceMs,2000);
 assert.equal(report.entries[0].mtimeA,new Date(a).toISOString());assert.equal(report.entries[0].mtimeB,new Date(b).toISOString());
 for(const format of ['text','csv','html']){const output=formatFolderReport(report,format);assert.match(output,/Ignore one-hour timestamp differences/);assert.match(output,/Ignore whole-hour timestamp differences/);assert.match(output,/Timestamp exceptions apply only to modified-time comparison, with the configured tolerance/);assert.match(output,/original displayed timestamps and newer-file direction are unchanged/);}
 const json=JSON.parse(formatFolderReport(report,'json'));assert.equal(json.rules.ignoreDaylightSaving,true);assert.equal(json.rules.ignoreTimezone,true);
 const defaults=createFolderReport({rules:{mode:'content',ignoreDaylightSaving:false,ignoreTimezone:false}});assert.equal(Object.hasOwn(defaults.rules,'ignoreDaylightSaving'),false);assert.equal(Object.hasOwn(defaults.rules,'ignoreTimezone'),false);
 const retained=createFolderReport({rules:{mode:'content',ignoreTimezone:true}});assert.equal(retained.rules.ignoreTimezone,true);
});

test('folder reports retain automatic name policy and original per-side paths',()=>{
 const report=createFolderReport({nameRules:{ignoreCase:true,normalizeUnicode:true},entries:[{...file('A.txt','equal','content'),pathA:'A.txt',pathB:'a.txt'}]});
 assert.deepEqual(report.nameRules,{ignoreCase:true,normalizeUnicode:true});assert.equal(report.entries[0].pathA,'A.txt');assert.equal(report.entries[0].pathB,'a.txt');
 for(const format of ['text','csv','html']){const text=formatFolderReport(report,format);assert.match(text,/Ignore letter case/);assert.match(text,/Equivalent Unicode names/);}
 const filename=createFolderReport({nameRules:report.nameRules,matchingMode:'filename'});assert.match(formatFolderReport(filename,'text'),/Not applied in filename-across-folders view/);
 assert.deepEqual(createFolderReport({}).nameRules,{});
});


test('extension matching reports retain policy and actual filenames in every export',()=>{
 const report=createFolderReport({nameRules:{ignoreExtension:true},entries:[{...file('module.js','changed','content'),pathA:'module.js',pathB:'module.ts'}]});
 assert.deepEqual(report.nameRules,{ignoreExtension:true});assert.equal(report.entries[0].pathA,'module.js');assert.equal(report.entries[0].pathB,'module.ts');
 for(const format of ['text','csv','html']){const output=formatFolderReport(report,format);assert.match(output,/Match files with different extensions/);assert.match(output,/full names first; same stem before final extension; ambiguous names unpaired/);assert.match(output,/module\.js/);assert.match(output,/module\.ts/);}
 const json=JSON.parse(formatFolderReport(report,'json'));assert.equal(json.nameRules.ignoreExtension,true);assert.equal(json.entries[0].pathB,'module.ts');
 assert.deepEqual(createFolderReport({nameRules:{ignoreExtension:false}}).nameRules,{});
 assert.throws(()=>createFolderReport({nameRules:{ignoreExtension:'yes'}}));
 const filename=createFolderReport({nameRules:report.nameRules,matchingMode:'filename'});const output=formatFolderReport(filename,'text');assert.match(output,/Not applied in filename-across-folders view/);assert.doesNotMatch(output,/Match files with different extensions/);
});


test('filename spelling criteria and differences survive reports without implying changed file contents',()=>{
 const report=createFolderReport({rules:{mode:'content',compareFilename:true},nameRules:{ignoreCase:true},entries:[{...file('README.txt','changed','content'),pathA:'README.txt',pathB:'readme.txt',contentStatus:'equal',metadataDifferences:['filename']},{path:'Dir',pathA:'Dir',pathB:'dir',kindA:'directory',kindB:'directory',status:'changed',contentStatus:'directory',metadataDifferences:['filename']}]});
 assert.equal(report.rules.compareFilename,true);assert.equal(report.statistics.different,2);assert.equal(report.statistics.contentMatches,0);assert.deepEqual(report.entries[0].metadataDifferences,['filename']);assert.equal(report.entries[0].contentStatus,'equal');
 for(const format of ['text','csv','html']){const output=formatFolderReport(report,format);assert.match(output,/Filename spelling/);assert.match(output,/Different: filename \(file comparison matches\)/);assert.match(output,/pairing rules are separate and names are not changed/);}
 const json=JSON.parse(formatFolderReport(report,'json'));assert.equal(json.rules.compareFilename,true);assert.deepEqual(json.entries[1].metadataDifferences,['filename']);assert.equal(json.entries[1].contentStatus,'directory');
 assert.equal(Object.hasOwn(createFolderReport({rules:{compareFilename:false}}).rules,'compareFilename'),false);
});

test('precise whitespace report descriptions and metadata agree with the selected scope',()=>{
 for(const [scope,label] of [['all','all whitespace within lines'],['leading','leading spaces/tabs'],['trailing','trailing spaces/tabs'],['edges','leading and trailing spaces/tabs'],['embedded','embedded spaces/tabs'],['leading-embedded','leading and embedded spaces/tabs'],['trailing-embedded','trailing and embedded spaces/tabs']]){
  const report=createFolderReport({rules:{mode:'text-whitespace-case',textWhitespaceScope:scope},entries:[file('text.txt','equal','text-normalized')]});
  assert.equal(report.rules.textWhitespaceScope,scope);
  for(const format of ['text','html','csv']){const output=formatFolderReport(report,format).toLowerCase();assert.ok(output.includes(label),scope+' '+format);assert.ok(output.includes('case and '+label+' ignored'));}
  assert.equal(JSON.parse(formatFolderReport(report,'json')).rules.textWhitespaceScope,scope);
 }
 assert.equal(createFolderReport({rules:{textWhitespaceScope:'horizontal'}}).rules.textWhitespaceScope,undefined);
 assert.throws(()=>createFolderReport({rules:{textWhitespaceScope:'unknown'}}),/whitespace/i);
 const retained=createFolderReport({rules:{mode:'content',textWhitespaceScope:'leading'}});assert.match(formatFolderReport(retained,'text'),/not applied by this comparison method/);
});

test('blank line reports distinguish ignored physical blanks from significant final newlines',()=>{
 const report=createFolderReport({rules:{mode:'text-content',ignoreBlankLines:true},entries:[file('blank.txt','equal','text-normalized')]});
 assert.equal(report.rules.ignoreBlankLines,true);
 for(const format of ['text','html','csv']){const output=formatFolderReport(report,format);assert.match(output,/blank lines ignored/);assert.match(output,/Empty lines and lines containing only spaces or tabs are ignored/);assert.doesNotMatch(output,/retain blank lines/);assert.match(output,/final newline after nonblank text/);}
 assert.equal(JSON.parse(formatFolderReport(report,'json')).rules.ignoreBlankLines,true);
 const dormant=createFolderReport({rules:{mode:'content',ignoreBlankLines:true}});assert.match(formatFolderReport(dormant,'text'),/Not applied by this comparison method/);
});

test('folder reports retain ignored-text expressions with escaped readable metadata',()=>{
 const report=createFolderReport({rules:{mode:'text-content',ignoredTextPatterns:[{pattern:'<tag>',matchCase:false}]}});
 assert.deepEqual(report.rules.ignoredTextPatterns,[{pattern:'<tag>',matchCase:false}]);assert.match(formatFolderReport(report,'text'),/<tag> \(ignore case\)/);assert.match(formatFolderReport(report,'html'),/&lt;tag&gt;/);assert.doesNotMatch(formatFolderReport(report,'html'),/<tag>/);
 assert.equal(createFolderReport({rules:{ignoredTextPatterns:[]}}).rules.ignoredTextPatterns,undefined);
 assert.throws(()=>createFolderReport({rules:{ignoredTextPatterns:[{pattern:'x',matchCase:'yes'}]}}));
});
