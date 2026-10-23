'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {encodeLeftHint,createLeftHintPublisher}=require('../desktop/explorer-left-hint.cjs');
const state=(name,kind='file',available=true)=>({left:{name,kind,path:'C:\\private\\never-publish.txt'},available});
const name=bytes=>bytes.subarray(10).toString('utf16le');
test('Explorer hint encodes exact bounded UTF16 display metadata without path authority',()=>{
 const bytes=encodeLeftHint(state('日本語 & 😀.txt'));assert.equal(bytes.subarray(0,4).toString(),'FCLH');assert.equal(bytes.readUInt16LE(4),1);assert.equal(bytes[6],1);assert.equal(bytes[7],1);assert.equal(bytes.readUInt16LE(8),'日本語 & 😀.txt'.length);assert.equal(name(bytes),'日本語 & 😀.txt');assert.ok(!bytes.includes(Buffer.from('private','utf16le')));
 assert.deepEqual(encodeLeftHint({left:null,available:false}),Buffer.from([70,67,76,72,1,0,0,0,0,0]));const folder=encodeLeftHint(state('folder','folder',false));assert.equal(folder[6],2);assert.equal(folder[7],0);
});
test('Explorer hint removes path prefixes, controls and bidi and truncates without splitting Unicode',()=>{
 assert.equal(name(encodeLeftHint(state('C:\\secret\\visible.txt'))),'visible.txt');assert.equal(name(encodeLeftHint(state('/private/visible.txt'))),'visible.txt');
 const cleaned=name(encodeLeftHint(state('a\u0000b\u0085c\u202ed\u2066e\u061cf')));assert.equal(cleaned,'a b c d e f');assert.equal(name(encodeLeftHint(state('x\u2028y\u206az'))),'x y z');
 const long=name(encodeLeftHint(state('a'.repeat(94)+'😀'+'b'.repeat(30))));assert.equal(long,'a'.repeat(94)+'…');assert.ok(encodeLeftHint(state('😀'.repeat(100))).length<=202);
 assert.equal(name(encodeLeftHint(state('\ud800.txt'))),'�.txt');assert.equal(name(encodeLeftHint(state('\n\u202e','folder'))),'Selected folder');
 for(const bad of [null,{}, {left:null,available:true},{left:{name:'x',kind:'link'},available:true},{left:{name:4,kind:'file'},available:false}])assert.throws(()=>encodeLeftHint(bad));
});
test('Explorer hint publications are ordered snapshots and recover after transport failure',async()=>{
 const calls=[];let release;const gate=new Promise(resolve=>release=resolve);const publish=createLeftHintPublisher(async bytes=>{calls.push(name(bytes));if(calls.length===1){await gate;throw Error('registry unavailable');}return 'written';});
 const mutable=state('first'),first=publish(mutable);mutable.left.name='changed';const second=publish(state('second'));await Promise.resolve();assert.deepEqual(calls,['first']);release();await assert.rejects(first,/registry unavailable/);assert.equal(await second,'written');assert.deepEqual(calls,['first','second']);await publish({left:null,available:false});assert.deepEqual(calls,['first','second','']);
});
