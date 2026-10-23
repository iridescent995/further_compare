#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <shobjidl.h>
#include <shlwapi.h>
#include <wrl/client.h>
#include <atomic>
#include <new>
#include "SelectionPolicy.hpp"
#include "ShellMetadataPolicy.hpp"
#include "LeftHint.hpp"

using Microsoft::WRL::ComPtr;
namespace fc = further_compare::explorer;
namespace {
static_assert(sizeof(wchar_t)==sizeof(char16_t),"Windows UTF-16 ABI required.");
static_assert(static_cast<int>(fc::Action::SetLeft)==0 && static_cast<int>(fc::Action::CompareLeft)==1 && static_cast<int>(fc::Action::CompareSelected)==2,"Command indices must match policy actions.");
HMODULE moduleHandle=nullptr;
std::atomic<long> objects{0}, locks{0};
// Keep this CLSID synchronized with Package.appxmanifest.in.
const CLSID RootCLSID={0xb93d608a,0xf29e,0x4b13,{0xa2,0x68,0x0b,0x07,0x29,0xa4,0xde,0xd8}};
const GUID ChildIDs[]={
 {0x7196de19,0xaa95,0x4fad,{0xa8,0x8d,0x77,0x4e,0xb2,0x6e,0xf9,0x21}},
 {0xd4312f3d,0x8247,0x4664,{0xb9,0x6f,0x3c,0xdb,0x58,0xd4,0x2d,0x11}},
 {0x25509ced,0x3cd4,0x434e,{0x90,0x4a,0xc2,0x95,0x25,0xe0,0x26,0xd1}}};
struct Lifetime { Lifetime(){++objects;} ~Lifetime(){--objects;} };
HRESULT exceptionResult() noexcept { try{throw;}catch(const std::bad_alloc&){return E_OUTOFMEMORY;}catch(...){return E_INVALIDARG;} }
std::u16string utf16(const std::wstring& text){return {text.begin(),text.end()};}
std::wstring wide(const std::u16string& text){return {text.begin(),text.end()};}

// Only Shell-provided metadata; no SFGAO_VALIDATE, bind/storage, enumeration,
// stat, file reads, registry reads, host launch, or network requests here.
HRESULT selectionKinds(IShellItemArray* selection,std::vector<fc::Kind>& kinds) {
 if(!selection)return E_INVALIDARG;
 DWORD count=0;HRESULT hr=selection->GetCount(&count);if(FAILED(hr))return hr;
 if(count<1||count>2)return E_INVALIDARG;
 for(DWORD i=0;i<count;++i){ComPtr<IShellItem> item;hr=selection->GetItemAt(i,&item);if(FAILED(hr))return hr;if(!item)return E_UNEXPECTED;
  SFGAOF attributes=0;hr=item->GetAttributes(SFGAO_FILESYSTEM|SFGAO_FOLDER|SFGAO_STREAM,&attributes);if(FAILED(hr))return hr;
  if(!(attributes&SFGAO_FILESYSTEM))return E_INVALIDARG;
  kinds.push_back(fc::kindFromShellMetadata((attributes&SFGAO_FILESYSTEM)!=0,(attributes&SFGAO_FOLDER)!=0,(attributes&SFGAO_STREAM)!=0));
 }
 return S_OK;
}
HRESULT captureSelection(IShellItemArray* selection,std::vector<fc::Item>& items) {
 if(!selection)return E_INVALIDARG;
 DWORD count=0;HRESULT hr=selection->GetCount(&count);if(FAILED(hr))return hr;
 if(count<1||count>2)return E_INVALIDARG;
 // Capture metadata and path from the same retained Shell item, once.
 for(DWORD i=0;i<count;++i){ComPtr<IShellItem> item;hr=selection->GetItemAt(i,&item);if(FAILED(hr))return hr;if(!item)return E_UNEXPECTED;
  SFGAOF attributes=0;hr=item->GetAttributes(SFGAO_FILESYSTEM|SFGAO_FOLDER|SFGAO_STREAM,&attributes);if(FAILED(hr))return hr;
  if(!(attributes&SFGAO_FILESYSTEM))return E_INVALIDARG;
  const auto kind=fc::kindFromShellMetadata(true,(attributes&SFGAO_FOLDER)!=0,(attributes&SFGAO_STREAM)!=0);
  PWSTR path=nullptr;hr=item->GetDisplayName(SIGDN_FILESYSPATH,&path);if(FAILED(hr))return hr;
  struct Free { PWSTR value;~Free(){CoTaskMemFree(value);} } cleanup{path};
  if(!path)return E_INVALIDARG;
  const auto length=wcsnlen_s(path,fc::MaxPathUnits+1);if(length>fc::MaxPathUnits)return E_INVALIDARG;
  items.push_back({utf16(std::wstring(path,length)),kind});
 }
 return S_OK;
}
fc::DisplayLeftHint readLeftHint() {
 // Fixed-size buffer and one local atomic value; never read a remembered path.
 std::vector<std::uint8_t> bytes(fc::MaxLeftHintBytes);DWORD size=static_cast<DWORD>(bytes.size()),type=0;
 const auto error=RegGetValueW(HKEY_CURRENT_USER,L"Software\\FurtherCompare\\Explorer",L"LeftHint",RRF_RT_REG_BINARY,&type,bytes.data(),&size);
 if(error!=ERROR_SUCCESS||type!=REG_BINARY||size>bytes.size())return {};
 bytes.resize(size);return fc::decodeLeftHint(bytes);
}
std::wstring configuredExecutable() {
 // Future owned installer writes this explicit value; this DLL never registers
 // itself or guesses Electron userData. REG_EXPAND_SZ is deliberately rejected.
 constexpr auto key=L"Software\\FurtherCompare\\Explorer";
 DWORD bytes=0,type=0;auto error=RegGetValueW(HKEY_CURRENT_USER,key,L"Executable",RRF_RT_REG_SZ|RRF_NOEXPAND,&type,nullptr,&bytes);
 if(error!=ERROR_SUCCESS||type!=REG_SZ||bytes<sizeof(wchar_t)||bytes>65536||bytes%sizeof(wchar_t))throw std::invalid_argument("Missing executable configuration.");
 std::vector<wchar_t> value(bytes/sizeof(wchar_t));
 error=RegGetValueW(HKEY_CURRENT_USER,key,L"Executable",RRF_RT_REG_SZ|RRF_NOEXPAND,&type,value.data(),&bytes);
 if(error!=ERROR_SUCCESS||type!=REG_SZ||bytes<sizeof(wchar_t)||bytes>value.size()*sizeof(wchar_t)||bytes%sizeof(wchar_t))throw std::invalid_argument("Executable configuration changed.");
 value.resize(bytes/sizeof(wchar_t));if(value.back()!=0)throw std::invalid_argument("Unterminated executable configuration.");
 std::wstring executable(value.data(),value.size()-1);
 if(executable.find(L'\0')!=std::wstring::npos||!fc::absoluteFilesystemPath(utf16(executable))||!(executable.size()>2&&fc::asciiLetter(executable[0])&&executable[1]==L':'&&executable[2]==L'\\'))throw std::invalid_argument("Invalid executable configuration.");
 std::vector<wchar_t> module(32768);const DWORD length=GetModuleFileNameW(moduleHandle,module.data(),static_cast<DWORD>(module.size()));
 if(!length||length>=module.size())throw std::invalid_argument("Extension location unavailable.");
 const std::wstring loaded(module.data(),length);const auto slash=loaded.find_last_of(L'\\');if(slash==std::wstring::npos)throw std::invalid_argument("Invalid extension location.");
 const auto expected=loaded.substr(0,slash+1)+L"Further Compare.exe";
 if(CompareStringOrdinal(executable.data(),static_cast<int>(executable.size()),expected.data(),static_cast<int>(expected.size()),TRUE)!=CSTR_EQUAL)
  throw std::invalid_argument("Configured host is not beside this extension.");
 return executable;
}
class Command;
HRESULT newCommand(int action,IExplorerCommand** output);
class Enumerator final:public IEnumExplorerCommand,private Lifetime {
 std::atomic<ULONG> refs_{1};ULONG position_=0;
 public:
 explicit Enumerator(ULONG position=0):position_(position){}
 HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id,void** out) override {if(!out)return E_POINTER;*out=nullptr;if(id!=IID_IUnknown&&id!=__uuidof(IEnumExplorerCommand))return E_NOINTERFACE;*out=static_cast<IEnumExplorerCommand*>(this);AddRef();return S_OK;}
 ULONG STDMETHODCALLTYPE AddRef() override{return ++refs_;}
 ULONG STDMETHODCALLTYPE Release() override{const auto n=--refs_;if(!n)delete this;return n;}
 HRESULT STDMETHODCALLTYPE Next(ULONG count,IExplorerCommand** output,ULONG* fetched) override {
  if(fetched)*fetched=0;if(!output||(!fetched&&count!=1))return E_POINTER;
  ULONG made=0;while(made<count&&position_<3){const auto hr=newCommand(static_cast<int>(position_),&output[made]);if(FAILED(hr)){for(ULONG i=0;i<made;++i){output[i]->Release();output[i]=nullptr;}position_-=made;return hr;}++made;++position_;}
  if(fetched)*fetched=made;return made==count?S_OK:S_FALSE;
 }
 HRESULT STDMETHODCALLTYPE Skip(ULONG count) override{const ULONG remaining=3-position_;if(count>remaining){position_=3;return S_FALSE;}position_+=count;return S_OK;}
 HRESULT STDMETHODCALLTYPE Reset() override{position_=0;return S_OK;}
 HRESULT STDMETHODCALLTYPE Clone(IEnumExplorerCommand** out) override{if(!out)return E_POINTER;*out=new(std::nothrow) Enumerator(position_);return *out?S_OK:E_OUTOFMEMORY;}
};
class Command final:public IExplorerCommand,private Lifetime {
 std::atomic<ULONG> refs_{1};int action_;
 public:
 explicit Command(int action):action_(action){}
 HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id,void** out) override{if(!out)return E_POINTER;*out=nullptr;if(id!=IID_IUnknown&&id!=__uuidof(IExplorerCommand))return E_NOINTERFACE;*out=static_cast<IExplorerCommand*>(this);AddRef();return S_OK;}
 ULONG STDMETHODCALLTYPE AddRef() override{return ++refs_;}
 ULONG STDMETHODCALLTYPE Release() override{const auto n=--refs_;if(!n)delete this;return n;}
 HRESULT STDMETHODCALLTYPE GetTitle(IShellItemArray*,PWSTR* title) override{if(!title)return E_POINTER;*title=nullptr;try{if(action_==1){const auto text=wide(fc::compareLeftTitle(readLeftHint()));return SHStrDupW(text.c_str(),title);}return SHStrDupW(action_<0?L"Further Compare":action_==0?L"Set as Left":L"Compare Selected",title);}catch(...){return exceptionResult();}}
 HRESULT STDMETHODCALLTYPE GetIcon(IShellItemArray*,PWSTR* icon) override{if(!icon)return E_POINTER;*icon=nullptr;return E_NOTIMPL;}
 HRESULT STDMETHODCALLTYPE GetToolTip(IShellItemArray*,PWSTR* text) override{if(!text)return E_POINTER;*text=nullptr;return SHStrDupW(L"Select one item, or exactly two files or two folders. Comparisons open in Further Compare.",text);}
 HRESULT STDMETHODCALLTYPE GetCanonicalName(GUID* id) override{if(!id)return E_POINTER;*id=action_<0?RootCLSID:ChildIDs[action_];return S_OK;}
 HRESULT STDMETHODCALLTYPE GetState(IShellItemArray* selection,BOOL okToBeSlow,EXPCMDSTATE* state) override{
  if(!state)return E_POINTER;*state=ECS_DISABLED;
  try{std::vector<fc::Kind> kinds;const auto hr=selectionKinds(selection,kinds);if(FAILED(hr))return S_OK;
   const bool single=kinds.size()==1,pair=kinds.size()==2&&kinds[0]==kinds[1];
   if(action_<0?(single||pair):(action_==2?pair:single))*state=ECS_ENABLED;
   if(action_==1&&single){if(!okToBeSlow){*state=ECS_DISABLED;return E_PENDING;}if(!fc::leftHintAllows(kinds[0],readLeftHint()))*state=ECS_DISABLED;}
   return S_OK;
  }catch(...){return exceptionResult();}
 }
 HRESULT STDMETHODCALLTYPE GetFlags(EXPCMDFLAGS* flags) override{if(!flags)return E_POINTER;*flags=action_<0?ECF_HASSUBCOMMANDS:ECF_DEFAULT;return S_OK;}
 HRESULT STDMETHODCALLTYPE EnumSubCommands(IEnumExplorerCommand** out) override{if(!out)return E_POINTER;*out=nullptr;if(action_>=0)return E_NOTIMPL;*out=new(std::nothrow) Enumerator();return *out?S_OK:E_OUTOFMEMORY;}
 HRESULT STDMETHODCALLTYPE Invoke(IShellItemArray* selection,IBindCtx*) override{
  if(action_<0)return E_NOTIMPL;
  try{
   std::vector<fc::Item> items;const auto hr=captureSelection(selection,items);if(FAILED(hr))return hr;
   const fc::Request request(static_cast<fc::Action>(action_),items); // immutable deep snapshot
   const auto executable=configuredExecutable();auto line=wide(fc::commandLine(utf16(executable),request));
   STARTUPINFOW startup{};startup.cb=sizeof(startup);PROCESS_INFORMATION process{};
   // Explicit executable is authority; no shell, protocol association, PATH lookup,
   // inherited handles, or filesystem content access in this extension.
   if(!CreateProcessW(executable.c_str(),line.data(),nullptr,nullptr,FALSE,0,nullptr,nullptr,&startup,&process))return HRESULT_FROM_WIN32(GetLastError());
   CloseHandle(process.hThread);CloseHandle(process.hProcess);return S_OK;
  }catch(...){return exceptionResult();}
 }
};
HRESULT newCommand(int action,IExplorerCommand** output){*output=new(std::nothrow) Command(action);return *output?S_OK:E_OUTOFMEMORY;}
class Factory final:public IClassFactory,private Lifetime {
 std::atomic<ULONG> refs_{1};
 public:
 HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id,void** out) override{if(!out)return E_POINTER;*out=nullptr;if(id!=IID_IUnknown&&id!=IID_IClassFactory)return E_NOINTERFACE;*out=static_cast<IClassFactory*>(this);AddRef();return S_OK;}
 ULONG STDMETHODCALLTYPE AddRef() override{return ++refs_;}
 ULONG STDMETHODCALLTYPE Release() override{const auto n=--refs_;if(!n)delete this;return n;}
 HRESULT STDMETHODCALLTYPE CreateInstance(IUnknown* outer,REFIID id,void** out) override{if(!out)return E_POINTER;*out=nullptr;if(outer)return CLASS_E_NOAGGREGATION;IExplorerCommand* command=nullptr;auto hr=newCommand(-1,&command);if(FAILED(hr))return hr;hr=command->QueryInterface(id,out);command->Release();return hr;}
 HRESULT STDMETHODCALLTYPE LockServer(BOOL lock) override{if(lock){++locks;return S_OK;}auto count=locks.load();while(count>0){if(locks.compare_exchange_weak(count,count-1))return S_OK;}return E_UNEXPECTED;}
};
}
extern "C" HRESULT __stdcall DllGetClassObject(REFCLSID clsid,REFIID iid,void** out){if(!out)return E_POINTER;*out=nullptr;if(clsid!=RootCLSID)return CLASS_E_CLASSNOTAVAILABLE;auto* factory=new(std::nothrow) Factory();if(!factory)return E_OUTOFMEMORY;const auto hr=factory->QueryInterface(iid,out);factory->Release();return hr;}
extern "C" HRESULT __stdcall DllCanUnloadNow(){return objects.load()==0&&locks.load()==0?S_OK:S_FALSE;}
BOOL WINAPI DllMain(HINSTANCE module,DWORD reason,LPVOID){if(reason==DLL_PROCESS_ATTACH){moduleHandle=module;}return TRUE;}
