'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateSession}=require('../desktop/sessions.cjs');
const {captureSessionDefaults,validateDefaultProfile}=require('../desktop/session-defaults.cjs');
const session=profile=>({version:1,type:'text-compare',name:'Profile test',text:{a:'// original',b:'code'},files:{a:{name:'',path:''},b:{name:'',path:''}},folders:{a:null,b:null},options:{ignoreWhitespace:false,filter:'all',direction:'a-to-b',textProfile:profile}});
test('text grammar profile survives session validation and default capture without changing text',()=>{
 for(const profile of ['plain','auto','java','xml','sql']){
  const original=session(profile),saved=validateSession(original);assert.equal(saved.options.textProfile,profile);assert.deepEqual(saved.text,original.text);
  const defaults=captureSessionDefaults(saved);assert.equal(defaults.options.textProfile,profile);assert.equal(validateDefaultProfile(defaults).options.textProfile,profile);
 }
 for(const profile of [null,{},true,'javascript','SQL','']){assert.throws(()=>validateSession(session(profile)),/profile/);assert.throws(()=>validateDefaultProfile({type:'text-compare',options:{textProfile:profile}}),/profile/);}
});
