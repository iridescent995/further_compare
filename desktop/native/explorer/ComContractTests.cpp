#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shobjidl.h>
#include <cassert>
#include <iostream>
#include <atomic>
#include <vector>
#include <initializer_list>

// Simulated Shell metadata only: never invoke a valid selection, register COM,
// or change configuration. Unsupported fake methods assert if unexpectedly used.
namespace {
std::atomic<long> liveFakes{0};
class Item final : public IShellItem {
 std::atomic<ULONG> refs_{1};
public:
 SFGAOF attributes; HRESULT result; bool denyPath=false; unsigned pathCalls=0;
 explicit Item(SFGAOF a,HRESULT r=S_OK):attributes(a),result(r){++liveFakes;}
 ~Item(){--liveFakes;}
 HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid,void** out) override {if(!out)return E_POINTER;*out=nullptr;if(iid!=IID_IUnknown&&iid!=IID_IShellItem)return E_NOINTERFACE;*out=static_cast<IShellItem*>(this);AddRef();return S_OK;}
 ULONG STDMETHODCALLTYPE AddRef() override{return ++refs_;}
 ULONG STDMETHODCALLTYPE Release() override{auto n=--refs_;if(!n)delete this;return n;}
 HRESULT STDMETHODCALLTYPE BindToHandler(IBindCtx*,REFGUID,REFIID,void**) override{assert(false);return E_NOTIMPL;}
 HRESULT STDMETHODCALLTYPE GetParent(IShellItem**) override{assert(false);return E_NOTIMPL;}
 HRESULT STDMETHODCALLTYPE GetDisplayName(SIGDN type,PWSTR* out) override{assert(denyPath);assert(type==SIGDN_FILESYSPATH);++pathCalls;if(!out)return E_POINTER;*out=nullptr;return E_ACCESSDENIED;}
 HRESULT STDMETHODCALLTYPE GetAttributes(SFGAOF mask,SFGAOF* out) override {assert(mask==(SFGAO_FILESYSTEM|SFGAO_FOLDER|SFGAO_STREAM));if(!out)return E_POINTER;*out=0;if(FAILED(result))return result;*out=attributes&mask;return S_OK;}
 HRESULT STDMETHODCALLTYPE Compare(IShellItem*,SICHINTF,int*) override{assert(false);return E_NOTIMPL;}
};
class Selection final : public IShellItemArray {
 std::atomic<ULONG> refs_{1};std::vector<IShellItem*> items_;
public:
 HRESULT countResult=S_OK,itemResult=S_OK; bool nullItem=false; unsigned itemCalls=0,countCalls=0;
 Selection(std::initializer_list<SFGAOF> attributes,HRESULT attributeResult=S_OK){++liveFakes;for(auto a:attributes)items_.push_back(new Item(a,attributeResult));}
 ~Selection(){for(auto item:items_)item->Release();--liveFakes;}
 HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid,void** out) override {if(!out)return E_POINTER;*out=nullptr;if(iid!=IID_IUnknown&&iid!=IID_IShellItemArray)return E_NOINTERFACE;*out=static_cast<IShellItemArray*>(this);AddRef();return S_OK;}
 ULONG STDMETHODCALLTYPE AddRef() override{return ++refs_;}
 ULONG STDMETHODCALLTYPE Release() override{auto n=--refs_;if(!n)delete this;return n;}
 HRESULT STDMETHODCALLTYPE BindToHandler(IBindCtx*,REFGUID,REFIID,void**) override{assert(false);return E_NOTIMPL;}
 HRESULT STDMETHODCALLTYPE GetPropertyStore(GETPROPERTYSTOREFLAGS,REFIID,void**) override{assert(false);return E_NOTIMPL;}
 HRESULT STDMETHODCALLTYPE GetPropertyDescriptionList(REFPROPERTYKEY,REFIID,void**) override{assert(false);return E_NOTIMPL;}
 HRESULT STDMETHODCALLTYPE GetAttributes(SIATTRIBFLAGS,SFGAOF,SFGAOF*) override{assert(false);return E_NOTIMPL;}
 Item* first(){return static_cast<Item*>(items_.at(0));}
 HRESULT STDMETHODCALLTYPE GetCount(DWORD* out) override{++countCalls;if(!out)return E_POINTER;*out=0;if(FAILED(countResult))return countResult;*out=static_cast<DWORD>(items_.size());return S_OK;}
 HRESULT STDMETHODCALLTYPE GetItemAt(DWORD index,IShellItem** out) override{++itemCalls;if(!out)return E_POINTER;*out=nullptr;if(FAILED(itemResult))return itemResult;if(index>=items_.size())return E_INVALIDARG;if(!nullItem){*out=items_[index];(*out)->AddRef();}return S_OK;}
 HRESULT STDMETHODCALLTYPE EnumItems(IEnumShellItems**) override{assert(false);return E_NOTIMPL;}
};
void selectionCases(IExplorerCommand* root,IExplorerCommand** children){
 const SFGAOF file=SFGAO_FILESYSTEM,folder=SFGAO_FILESYSTEM|SFGAO_FOLDER,zip=SFGAO_FILESYSTEM|SFGAO_FOLDER|SFGAO_STREAM;
 auto check=[&](Selection* selection,bool single,bool pair){
  IExplorerCommand* commands[]={root,children[0],children[1],children[2]};
  for(unsigned i=0;i<4;++i){EXPCMDSTATE state=ECS_ENABLED;auto hr=commands[i]->GetState(selection,FALSE,&state);bool pending=i==2&&single;assert(hr==(pending?E_PENDING:S_OK));bool enabled=i==0?(single||pair):i==1?single:i==3?pair:false;assert(state==(enabled?ECS_ENABLED:ECS_DISABLED));}
  if(!single&&!pair&&SUCCEEDED(selection->countResult)){DWORD count=0;selection->GetCount(&count);if(count==0||count>2)assert(selection->itemCalls==0);}
  selection->Release();assert(liveFakes==0);
 };
 check(new Selection({file}),true,false);check(new Selection({folder}),true,false);check(new Selection({zip}),true,false);
 check(new Selection({file,file}),false,true);check(new Selection({folder,folder}),false,true);check(new Selection({zip,file}),false,true);
 check(new Selection({file,folder}),false,false);check(new Selection({zip,folder}),false,false);
 check(new Selection({SFGAO_FOLDER}),false,false);check(new Selection({SFGAO_STREAM}),false,false);
 check(new Selection({}),false,false);
 auto many=new Selection({file,file,file});check(many,false,false);
 auto failedCount=new Selection({file});failedCount->countResult=E_FAIL;check(failedCount,false,false);
 auto failedItem=new Selection({file});failedItem->itemResult=E_FAIL;check(failedItem,false,false);
 auto missingItem=new Selection({file});missingItem->nullItem=true;check(missingItem,false,false);
 check(new Selection({file},E_ACCESSDENIED),false,false);
 for(unsigned action=0;action<3;++action){
  auto denied=action==2?new Selection({file,file}):new Selection({file});
  denied->first()->denyPath=true;
  // Path denial is returned before configuredExecutable/registry access or launch.
  assert(children[action]->Invoke(denied,nullptr)==E_ACCESSDENIED);
  assert(denied->countCalls==1&&denied->itemCalls==1&&denied->first()->pathCalls==1);
  denied->Release();assert(liveFakes==0);
 }
 assert(liveFakes==0);
}
}
int wmain(int argc,wchar_t** argv){
 if(argc!=2)return 2;
 HMODULE dll=LoadLibraryW(argv[1]);assert(dll);
 using GetClass=HRESULT(__stdcall*)(REFCLSID,REFIID,void**);
 using CanUnload=HRESULT(__stdcall*)();
 auto get=reinterpret_cast<GetClass>(GetProcAddress(dll,"DllGetClassObject"));
 auto unload=reinterpret_cast<CanUnload>(GetProcAddress(dll,"DllCanUnloadNow"));assert(get&&unload);
 const CLSID root={0xb93d608a,0xf29e,0x4b13,{0xa2,0x68,0x0b,0x07,0x29,0xa4,0xde,0xd8}};
 assert(unload()==S_OK);
 IClassFactory* factory=nullptr;assert(get(GUID_NULL,IID_IClassFactory,reinterpret_cast<void**>(&factory))==CLASS_E_CLASSNOTAVAILABLE&&!factory);
 assert(get(root,IID_IClassFactory,reinterpret_cast<void**>(&factory))==S_OK&&factory);assert(unload()==S_FALSE);
 assert(factory->LockServer(FALSE)==E_UNEXPECTED);assert(factory->LockServer(TRUE)==S_OK);
 IExplorerCommand* command=nullptr;assert(factory->CreateInstance(nullptr,__uuidof(IExplorerCommand),reinterpret_cast<void**>(&command))==S_OK);
 EXPCMDFLAGS flags=ECF_DEFAULT;assert(command->GetFlags(&flags)==S_OK&&flags==ECF_HASSUBCOMMANDS);
 PWSTR title=nullptr;assert(command->GetTitle(nullptr,&title)==S_OK&&wcscmp(title,L"Further Compare")==0);CoTaskMemFree(title);
 EXPCMDSTATE state=ECS_ENABLED;assert(command->GetState(nullptr,FALSE,&state)==S_OK&&state==ECS_DISABLED);
 IEnumExplorerCommand* enumeration=nullptr;assert(command->EnumSubCommands(&enumeration)==S_OK);
 IExplorerCommand* children[3]={};ULONG fetched=0;assert(enumeration->Next(3,children,&fetched)==S_OK&&fetched==3);
 selectionCases(command,children);assert(unload()==S_FALSE);
 const wchar_t* names[]={L"Set as Left",L"Compare with Left",L"Compare Selected"};
 for(int i=0;i<3;++i){title=nullptr;assert(children[i]->GetTitle(nullptr,&title)==S_OK&&(i==1?wcsncmp(title,L"Compare with ",13)==0:wcscmp(title,names[i])==0));CoTaskMemFree(title);assert(children[i]->Invoke(nullptr,nullptr)==E_INVALIDARG);children[i]->Release();}
 assert(enumeration->Skip(1)==S_FALSE);assert(enumeration->Reset()==S_OK);assert(enumeration->Skip(1)==S_OK);
 IEnumExplorerCommand* clone=nullptr;assert(enumeration->Clone(&clone)==S_OK);assert(clone->Next(1,&children[0],nullptr)==S_OK);title=nullptr;assert(children[0]->GetTitle(nullptr,&title)==S_OK&&wcsncmp(title,L"Compare with ",13)==0);CoTaskMemFree(title);children[0]->Release();clone->Release();enumeration->Release();command->Release();
 assert(factory->LockServer(FALSE)==S_OK);factory->Release();assert(unload()==S_OK);FreeLibrary(dll);
 std::cout<<"COM export/lifetime/subcommand contract passed; no Explorer activation performed.\n";
}
