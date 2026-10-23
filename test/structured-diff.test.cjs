const test = require('node:test');
const assert = require('node:assert/strict');
const {parseDelimited, compareTables, compareBinary, mergeText3} = require('../src/structured-diff.cjs');
test('CSV/TSV preserve quoted delimiters, newlines, escaped quotes, empty fields and record boundaries', () => {
  assert.deepEqual(parseDelimited('a,"b,b","line\r\nnext","say ""hi""",\r\n1,2,,,\r\n'), [['a','b,b','line\r\nnext','say "hi"',''],['1','2','','','']]);
  assert.deepEqual(parseDelimited('x\t"a\tb"\t', '\t'), [['x','a\tb','']]);
  assert.deepEqual(parseDelimited(''), []); assert.deepEqual(parseDelimited('\n'), [['']]);
  assert.throws(() => parseDelimited('"a'), /Unterminated/); assert.throws(() => parseDelimited('"a"x'), /Invalid/);
});
test('table comparison keys align reordered records and distinguish absent cells from empty cells', () => {
  const out = compareTables([['a','1'],['b','2'],['c','']], [['b','3'],['a','1'],['d']], {keyColumns:[0]});
  assert.deepEqual(out.rows.map(r=>r.status), ['equal','changed','left','right']);
  assert.equal(out.rows[1].rightIndex, 0); assert.equal(out.rows[1].cells[1].equal, false);
  assert.equal(compareTables([['']], [[]]).rows[0].status, 'changed');
  assert.equal(compareTables([['x','a']], [['y','a']], {keyColumns:[1]}).rows[0].status, 'changed');
});
test('table duplicate keys fail visibly and composite keys cannot collide through delimiters', () => {
  assert.equal(compareTables([['a'],['a']], [['a']], {keyColumns:[0]}).duplicates.length, 1);
  assert.deepEqual(compareTables([['a'],['a']], [], {keyColumns:[0]}).rows, []);
  assert.equal(compareTables([['a|b','c'],['a','b|c']], [], {keyColumns:[0,1]}).duplicates.length, 0);
  assert.throws(()=>compareTables([[]], [], {keyColumns:[0]}), /missing/);
});
test('binary comparison reports exact offsets, tails, and bounded output with complete counts', () => {
  const out = compareBinary(Uint8Array.from([1,2,3,4,5]), Uint8Array.from([0,2,0,4]), {maxRanges:2});
  assert.deepEqual(out.ranges.map(r=>[r.start,r.end]), [[0,1],[2,3]]);
  assert.equal(out.differingBytes,3); assert.equal(out.rangeCount,3); assert.equal(out.truncated,true);
  assert.equal(compareBinary(Buffer.from('a'),Buffer.from('a')).equal,true);
  assert.equal(compareBinary(new Uint8Array(),new Uint8Array()).equal,true);
});
test('three-way merge combines nonoverlapping edits and preserves final newline and CRLF', () => {
  assert.equal(mergeText3('a\nb\nc\n','A\nb\nc\n','a\nb\nC\n').text, 'A\nb\nC\n');
  assert.equal(mergeText3('a\r\nb', 'A\r\nb', 'a\r\nB').text, 'A\r\nB');
  assert.equal(mergeText3('a\nb', 'a\nb', 'a\nb\n').text, 'a\nb\n');
  assert.equal(mergeText3('a\nb\nc','b\nc','a\nb\nC').text,'b\nC');
});
test('three-way merge accepts identical edits but exposes overlaps and competing insertions without choosing a winner', () => {
  assert.equal(mergeText3('a\n','b\n','b\n').text,'b\n');
  const out = mergeText3('a\nb\nc\n','a\nLEFT\nc\n','a\nRIGHT\nc\n');
  assert.equal(out.clean,false); assert.equal(out.text,null);
  assert.deepEqual(out.conflicts[0],{type:'conflict',start:1,end:2,base:'b\n',left:'LEFT\n',right:'RIGHT\n'});
  assert.equal(out.segments[0].text,'a\n'); assert.equal(out.segments.at(-1).text,'c\n');
  assert.equal(mergeText3('', 'left', 'right').conflicts.length,1);
  assert.equal(mergeText3('a\nb\n', 'a\n', 'a\nB\n').clean,false);
});
test('three-way merge identity laws hold across insert/delete/repeated-line combinations', () => {
  const fixtures = ['', 'a', 'a\n', '\n', 'a\na\nb\n', 'x\ny\nx', 'a\r\nb\r\n'];
  for (const base of fixtures) for (const changed of fixtures) {
    assert.equal(mergeText3(base, changed, base).text, changed);
    assert.equal(mergeText3(base, base, changed).text, changed);
    assert.equal(mergeText3(base, changed, changed).text, changed);
  }
});
test('binary range cap bounds memory for many disjoint differences', () => {
  const a = new Uint8Array(1000000), b = new Uint8Array(1000000);
  for (let i = 0; i < b.length; i += 2) b[i] = 1;
  const out = compareBinary(a, b, {maxRanges:3});
  assert.equal(out.ranges.length,3); assert.equal(out.rangeCount,500000); assert.equal(out.differingBytes,500000);
});
test('merge rejects excessive change complexity instead of silently producing an incomplete merge', () => {
  assert.throws(()=>mergeText3('a\nb\nc\n','x\ny\nz\n','a\nb\nc\n',{maxEditLength:1}), /complexity/);
});
