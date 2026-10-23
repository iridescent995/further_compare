'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{promisify}=require('node:util'),{execFile}=require('node:child_process');const exec=promisify(execFile);
test('native display hint decoder rejects malformed input and safely formats filename titles',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-explorer-hint-'));
 try{const file=path.join(root,'check.cpp'),binary=path.join(root,'check');await fs.writeFile(file,String.raw`
#include "LeftHint.hpp"
#include <cassert>
using namespace further_compare::explorer;
std::vector<std::uint8_t> encode(unsigned char kind,unsigned char available,std::u16string name){std::vector<std::uint8_t>b={'F','C','L','H',1,0,kind,available,static_cast<std::uint8_t>(name.size()),static_cast<std::uint8_t>(name.size()>>8)};for(auto c:name){b.push_back(c&255);b.push_back(c>>8);}return b;}
void unknown(const std::vector<std::uint8_t>& bytes){const auto hint=decodeLeftHint(bytes);assert(hint.policy.state==LeftState::Unknown);assert(compareLeftTitle(hint)==u"Compare with Left");assert(leftHintAllows(Kind::File,hint));}
int main(){
 const auto bytes=encode(1,1,u"資料 & \U0001F680.txt");const auto hint=decodeLeftHint(bytes);assert(hint.policy.state==LeftState::Available&&hint.policy.kind==Kind::File);assert(hint.name==u"資料 & \U0001F680.txt");assert(compareLeftTitle(hint)==u"Compare with \u201c資料 && \U0001F680.txt\u201d");assert(leftHintAllows(Kind::File,hint));assert(!leftHintAllows(Kind::Folder,hint));
 const auto none=decodeLeftHint(encode(0,0,u""));assert(none.policy.state==LeftState::Unavailable&&!leftHintAllows(Kind::File,none));assert(compareLeftTitle(none)==u"Compare with Left");
 const auto folder=decodeLeftHint(encode(2,1,u"Folder"));assert(leftHintAllows(Kind::Folder,folder));assert(!leftHintAllows(Kind::File,folder));assert(!leftHintAllows(Kind::Folder,decodeLeftHint(encode(2,0,u"Folder"))));
 for(std::size_t length=0;length<bytes.size();++length)unknown({bytes.begin(),bytes.begin()+length});
 auto extra=bytes;extra.push_back(0);unknown(extra);for(int offset:{0,4,5,6,7,8,9}){auto bad=bytes;bad[offset]=255;unknown(bad);}
 unknown(encode(0,1,u""));unknown(encode(0,0,u"name"));unknown(encode(1,1,std::u16string(97,u'x')));
 assert(decodeLeftHint(encode(1,1,std::u16string(96,u'x'))).name.size()==96);
 for(char16_t c:{char16_t(0),char16_t(9),char16_t(31),char16_t(127),char16_t(159),char16_t(0x061C),char16_t(0x200E),char16_t(0x200F),char16_t(0x2028),char16_t(0x202E),char16_t(0x2066),char16_t(0x206F),char16_t(0xD800),char16_t(0xDC00)})unknown(encode(1,1,std::u16string(1,c)));
 assert(compareLeftTitle(decodeLeftHint(encode(1,1,u"&&")))==u"Compare with \u201c&&&&\u201d");
 assert(decodeLeftHint(encode(1,1,u"replacement \uFFFD")).policy.state==LeftState::Available);
}
`);await exec(process.env.CXX||'clang++',['-std=c++17','-Wall','-Wextra','-Werror','-pedantic','-I',path.resolve('desktop/native/explorer'),file,'-o',binary],{timeout:60000});await exec(binary,[],{timeout:10000});
 const source=await fs.readFile('desktop/native/explorer/ExplorerCommand.cpp','utf8');assert.match(source,/RRF_RT_REG_BINARY/);assert.match(source,/std::vector<std::uint8_t> bytes\(fc::MaxLeftHintBytes\)/);assert.match(source,/if\(!okToBeSlow\)\{\*state=ECS_DISABLED;return E_PENDING;\}/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('actual JavaScript hint producer interoperates with native UTF-16 decoder',async()=>{
 const {encodeLeftHint}=require('../desktop/explorer-left-hint.cjs');
 const cases=[
  [{available:false,left:null},'',0],
  [{available:true,left:{kind:'file',name:'C:\\private\\資料 & 🚀.txt'}},'資料 & 🚀.txt',1],
  [{available:false,left:{kind:'folder',name:'/private/old folder'}},'old folder',2],
  [{available:true,left:{kind:'file',name:'bad\ud800x\udc00.txt'}},'bad�x�.txt',1],
  [{available:true,left:{kind:'file',name:'\u0000\u009f\u061c\u200e\u200f\u2028\u202e\u2066\u206f'}},'Selected file',1],
  [{available:true,left:{kind:'folder',name:'/' }},'Selected folder',2],
  [{available:true,left:{kind:'file',name:'x'.repeat(96)}},'x'.repeat(96),1],
  [{available:true,left:{kind:'file',name:'x'.repeat(94)+'🚀tail'}},'x'.repeat(94)+'…',1],
  [{available:true,left:{kind:'file',name:'a'.repeat(100)}},'a'.repeat(95)+'…',1],
 ];
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-hint-interop-'));
 const units=s=>`std::u16string{${Array.from({length:s.length},(_,i)=>`char16_t(${s.charCodeAt(i)})`).join(',')}}`;
 try{
  const checks=cases.map(([state,name,kind])=>{
   const bytes=encodeLeftHint(state);assert.ok(bytes.length<=202);
   return `{ const auto h=decodeLeftHint({${[...bytes].join(',')}}); assert(h.policy.state==LeftState::${state.available?'Available':'Unavailable'}); assert((h.name==${units(name)})); assert(h.policy.kind==Kind::${kind===1?'File':kind===2?'Folder':'Virtual'}); assert((compareLeftTitle(h)==${units(name?`Compare with “${name.replaceAll('&','&&')}”`:'Compare with Left')})); }`;
  }).join('\n');
  const file=path.join(root,'interop.cpp'),binary=path.join(root,'interop');
  await fs.writeFile(file,`#include "LeftHint.hpp"\n#include <cassert>\nusing namespace further_compare::explorer;\nint main(){${checks}}\n`);
  await exec(process.env.CXX||'clang++',['-std=c++17','-Wall','-Wextra','-Werror','-pedantic','-I',path.resolve('desktop/native/explorer'),file,'-o',binary],{timeout:60000});
  await exec(binary,[],{timeout:10000});
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
