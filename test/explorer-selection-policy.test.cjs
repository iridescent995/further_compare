'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util');const exec=promisify(execFile);
test('portable native Explorer policy captures exact UTF-16 selection and bounds Windows dispatch',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-explorer-policy-'));
 try{
  const source=String.raw`
#include "SelectionPolicy.hpp"
#include <cassert>
#include <iostream>
using namespace further_compare::explorer;
template<class F> void rejects(F fn) { bool threw=false;try {fn();}catch(const std::exception&) {threw=true;}assert(threw); }
int main() {
 const Item file{u"C:\\work\\a & b.txt",Kind::File},folder{u"C:\\work\\folder",Kind::Folder};
 assert(selectionPolicy({}).reason==Reason::NoSelection);
 assert(selectionPolicy({file,file,file}).reason==Reason::TooMany);
 assert(selectionPolicy({file,folder}).reason==Reason::MixedKinds);
 assert(selectionPolicy({{u"shell:Downloads",Kind::Virtual}}).reason==Reason::UnsupportedItem);
 assert(selectionPolicy({file,file}).compareSelected);
 assert(selectionPolicy({folder,folder}).compareSelected);
 assert(!selectionPolicy({file,file}).setLeft && !selectionPolicy({file,file}).compareLeft);
 const auto missing=selectionPolicy({file},{LeftState::Unavailable,Kind::File});assert(missing.setLeft&&!missing.compareLeft&&missing.reason==Reason::LeftUnavailable);
 const auto mismatch=selectionPolicy({file},{LeftState::Available,Kind::Folder});assert(mismatch.setLeft&&!mismatch.compareLeft&&mismatch.reason==Reason::LeftKindMismatch);
 assert(selectionPolicy({folder},{LeftState::Available,Kind::Folder}).compareLeft);
 assert(selectionPolicy({file}).compareLeft); // Unknown hint delegates authority to host.
 for(const auto& invalid:std::vector<std::u16string>{u"a.txt",u"C:a.txt",u"\\a.txt",u"/tmp/a",u"\\\\server",u"\\\\server\\",u"\\\\.\\pipe\\x",u"\\\\?\\GLOBALROOT\\Device\\x",u"C:\\a\nb",u"C:\\a\"b",u"C:\\a:stream",u"C:\\*.txt",std::u16string(1,0xD800),std::u16string(1,0xDC00)}) assert(!absoluteFilesystemPath(invalid));
 assert(absoluteFilesystemPath(u"C:\\"));assert(absoluteFilesystemPath(u"\\\\server\\share\\a.txt"));assert(absoluteFilesystemPath(u"\\\\?\\C:\\long\\a.txt"));assert(absoluteFilesystemPath(u"\\\\?\\UNC\\server\\share\\a.txt"));
 assert(!absoluteFilesystemPath(std::u16string(u"C:\\a")+char16_t(0)+u"b"));
 std::vector<Item> selection{{u"C:\\資料\\emoji-\U0001F680 & %^!.txt",Kind::File},file};
 Request captured(Action::CompareSelected,selection);const auto original=selection[0].path;selection[0].path=u"C:\\changed.txt";selection.clear();assert(captured.items()[0].path==original);assert(captured.items()[1].path==file.path);
 assert(captured.flag()==u"--fc-compare-selected");assert(Request(Action::SetLeft,{file}).flag()==u"--fc-set-left");assert(Request(Action::CompareLeft,{file}).flag()==u"--fc-compare-left");
 rejects([&]{Request r(Action::CompareSelected,{file});});rejects([&]{Request r(Action::SetLeft,{file,file});});rejects([&]{Request r(Action::CompareSelected,{file,folder});});rejects([&]{Request r(Action::CompareLeft,{file},{LeftState::Unavailable,Kind::File});});rejects([&]{Request r(static_cast<Action>(99),{file});});
 assert(quoteWindowsArgument(u"")==u"\"\"");assert(quoteWindowsArgument(u"a b")==u"\"a b\"");
 assert(quoteWindowsArgument(u"a\"b")==u"\"a\\\"b\"");
 assert(quoteWindowsArgument(u"C:\\folder\\")==u"\"C:\\folder\\\\\"");
 assert(quoteWindowsArgument(u"a\\\"b")==u"\"a\\\\\\\"b\"");
 const auto exe=u"C:\\Program Files\\Further Compare\\Further Compare.exe";
 const auto command=commandLine(exe,Request(Action::SetLeft,{file}));assert(command==u"\"C:\\Program Files\\Further Compare\\Further Compare.exe\" --fc-set-left \"C:\\work\\a & b.txt\"");
 const auto unicode=commandLine(exe,captured);assert(unicode.find(original)!=std::u16string::npos);assert(unicode.find(u"--fc-compare-selected")!=std::u16string::npos);
 rejects([&]{commandLine(u"Further Compare.exe",captured);});rejects([&]{commandLine(u"C:\\evil.exe",captured);});
 // Count the complete UTF-16 command line, including host/flag/quoting overhead.
 const auto base=commandLine(exe,Request(Action::SetLeft,{{u"C:\\x",Kind::File}}));
 const auto exactPath=std::u16string(u"C:\\")+std::u16string(MaxCommandLineUnits-base.size()+1,u'x');
 assert(commandLine(exe,Request(Action::SetLeft,{{exactPath,Kind::File}})).size()==MaxCommandLineUnits);
 rejects([&]{commandLine(exe,Request(Action::SetLeft,{{exactPath+u"x",Kind::File}}));});
 const Item longFile{std::u16string(u"C:\\")+std::u16string(17000,u'x'),Kind::File};rejects([&]{commandLine(exe,Request(Action::CompareSelected,{longFile,longFile}));});
 std::cout<<"Explorer pure policy passed; no COM registration or Windows runtime exercised.\n";
}
`;
  const input=path.join(root,'policy.cpp'),binary=path.join(root,'policy');await fs.writeFile(input,source);
  const compiler=process.env.CXX||'clang++';await exec(compiler,['-std=c++17','-Wall','-Wextra','-Werror','-pedantic','-I',path.resolve('desktop/native/explorer'),input,'-o',binary],{timeout:60000});
  const result=await exec(binary,[],{timeout:10000});assert.match(result.stdout,/Explorer pure policy passed/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
