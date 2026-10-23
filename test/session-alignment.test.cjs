'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {validateSession} = require('../desktop/sessions.cjs');
function session(anchors) {
  const value = {version:1,type:'text-compare',name:'Alignment',text:{a:'first\r\nsecond\rthird\n',b:'one\ntwo\nthree\n'},files:{a:{name:'',path:''},b:{name:'',path:''}},folders:{a:null,b:null},options:{ignoreWhitespace:false,filter:'all',direction:'a-to-b'}};
  if (anchors !== undefined) value.options.textAlignment = anchors;
  return value;
}
test('session alignment is optional, copied, and counts normalized lines including trailing blanks', () => {
  assert.equal(validateSession(session()).options.textAlignment, undefined);
  assert.deepEqual(validateSession(session([])).options.textAlignment, []);
  const anchors = [{a:0,b:1},{a:3,b:3}];
  const restored = validateSession(session(anchors)).options.textAlignment;
  assert.deepEqual(restored, anchors);
  restored[0].a = 2;
  assert.equal(anchors[0].a, 0);
  const empty = session([{a:0,b:0}]);
  empty.text.a = '';
  assert.throws(() => validateSession(empty), /text alignment/);
});
test('session alignment rejects crossing, duplicate, out of range and malformed anchors', () => {
  const invalid = [
    null, {}, '0:0', [null], [[]], [{a:0}], [{a:0,b:0,extra:true}],
    [{a:-1,b:0}], [{a:0,b:-1}], [{a:4,b:0}], [{a:0,b:4}],
    [{a:0.5,b:0}], [{a:0,b:'0'}], [{a:NaN,b:0}], [{a:0,b:Infinity}],
    [{a:0,b:1},{a:1,b:0}], [{a:1,b:0},{a:0,b:1}],
    [{a:0,b:0},{a:0,b:1}], [{a:0,b:0},{a:1,b:0}],
    [Object.assign(new Date(),{a:0,b:0})], Array(1),
  ];
  for (const anchors of invalid) assert.throws(() => validateSession(session(anchors)), /text alignment/);
});
test('session alignment accepts at most 1000 ordered anchors', () => {
  const anchors = Array.from({length:1000}, (_,i) => ({a:i,b:i}));
  const value = session(anchors);
  value.text = {a:'line\n'.repeat(1000),b:'line\n'.repeat(1000)};
  assert.equal(validateSession(value).options.textAlignment.length, 1000);
  value.options.textAlignment.push({a:1000,b:1000});
  assert.throws(() => validateSession(value), /text alignment/);
});
