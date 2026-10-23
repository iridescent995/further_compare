#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <appmodel.h>
#include <appxpackaging.h>
#include <shlwapi.h>
#include <xmllite.h>
#include "ProductManifest.hpp"
#include <wintrust.h>
#include <softpub.h>
#include <wincrypt.h>
#include <wrl/client.h>
#include <iostream>
#include <string>
#include <vector>
#include <set>
#include <stdexcept>
using Microsoft::WRL::ComPtr;
namespace {
struct Failure { HRESULT code; };
void check(HRESULT hr){if(FAILED(hr))throw Failure{hr};}
void require(bool value){if(!value)throw Failure{E_INVALIDARG};}
struct Handle{HANDLE h=INVALID_HANDLE_VALUE;~Handle(){if(h!=INVALID_HANDLE_VALUE)CloseHandle(h);}};
struct Text{LPWSTR p=nullptr;~Text(){CoTaskMemFree(p);}std::wstring str()const{return p?std::wstring(p):L"";}};
std::string json(const std::wstring& value){require(value.size()<=32768);if(value.empty())return "\"\"";const int size=WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,value.data(),static_cast<int>(value.size()),nullptr,0,nullptr,nullptr);require(size>0);std::string utf8(size,'\0');require(WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,value.data(),static_cast<int>(value.size()),utf8.data(),size,nullptr,nullptr)==size);std::string out="\"";constexpr char hex[]="0123456789abcdef";for(unsigned char c:utf8){if(c=='"'||c=='\\'){out+='\\';out+=static_cast<char>(c);}else if(c<32){out+="\\u00";out+=hex[c>>4];out+=hex[c&15];}else out+=static_cast<char>(c);}return out+'"';}
void localPath(const std::wstring& path){require(path.size()>3&&path.size()<30000&&((path[0]>=L'A'&&path[0]<=L'Z')||(path[0]>=L'a'&&path[0]<=L'z'))&&path[1]==L':'&&path[2]==L'\\');for(size_t i=2;i<path.size();i++)require(path[i]>=32&&std::wstring(L"\"<>|?*/:").find(path[i])==std::wstring::npos);std::vector<wchar_t> full(32768);const auto count=GetFullPathNameW(path.c_str(),static_cast<DWORD>(full.size()),full.data(),nullptr);require(count>0&&count<full.size()&&path==std::wstring(full.data(),count));}
std::string hashFile(HANDLE file){HCRYPTPROV provider=0;HCRYPTHASH hash=0;if(!CryptAcquireContextW(&provider,nullptr,nullptr,PROV_RSA_AES,CRYPT_VERIFYCONTEXT))throw Failure{HRESULT_FROM_WIN32(GetLastError())};struct Cleanup{HCRYPTPROV p;HCRYPTHASH& h;~Cleanup(){if(h)CryptDestroyHash(h);CryptReleaseContext(p,0);}} cleanup{provider,hash};if(!CryptCreateHash(provider,CALG_SHA_256,0,0,&hash))throw Failure{HRESULT_FROM_WIN32(GetLastError())};BYTE chunk[65536];DWORD got=0;while(true){if(!ReadFile(file,chunk,sizeof(chunk),&got,nullptr))throw Failure{HRESULT_FROM_WIN32(GetLastError())};if(!got)break;if(!CryptHashData(hash,chunk,got,0))throw Failure{HRESULT_FROM_WIN32(GetLastError())};}BYTE bytes[32];DWORD size=32;if(!CryptGetHashParam(hash,HP_HASHVAL,bytes,&size,0)||size!=32)throw Failure{E_FAIL};std::string out;constexpr char hex[]="0123456789abcdef";for(BYTE b:bytes){out+=hex[b>>4];out+=hex[b&15];}return out;}
struct Trust {
 WINTRUST_FILE_INFO file{};WINTRUST_DATA data{};GUID action=WINTRUST_ACTION_GENERIC_VERIFY_V2;
 Trust(const std::wstring& path,HANDLE handle){file.cbStruct=sizeof(file);file.pcwszFilePath=path.c_str();file.hFile=handle;data.cbStruct=sizeof(data);data.dwUIChoice=WTD_UI_NONE;data.fdwRevocationChecks=WTD_REVOKE_WHOLECHAIN;data.dwUnionChoice=WTD_CHOICE_FILE;data.pFile=&file;data.dwStateAction=WTD_STATEACTION_VERIFY;data.dwProvFlags=WTD_CACHE_ONLY_URL_RETRIEVAL|WTD_REVOCATION_CHECK_CHAIN_EXCLUDE_ROOT;const LONG result=WinVerifyTrust(nullptr,&action,&data);if(result!=ERROR_SUCCESS){close();throw Failure{static_cast<HRESULT>(result)};}}
 void close(){if(data.hWVTStateData){data.dwStateAction=WTD_STATEACTION_CLOSE;WinVerifyTrust(nullptr,&action,&data);data.hWVTStateData=nullptr;}}
 ~Trust(){close();}
 void publisher(const std::wstring& expected){auto* provider=WTHelperProvDataFromStateData(data.hWVTStateData);require(provider!=nullptr);auto* signer=WTHelperGetProvSignerFromChain(provider,0,FALSE,0);require(signer&&signer->csCertChain>0&&signer->pasCertChain[0].pCert);DWORD size=0;require(CertStrToNameW(X509_ASN_ENCODING,expected.c_str(),CERT_X500_NAME_STR,nullptr,nullptr,&size,nullptr)!=FALSE&&size<=65536);std::vector<BYTE> bytes(size);require(CertStrToNameW(X509_ASN_ENCODING,expected.c_str(),CERT_X500_NAME_STR,nullptr,bytes.data(),&size,nullptr)!=FALSE);CERT_NAME_BLOB name{size,bytes.data()};require(CertCompareCertificateName(X509_ASN_ENCODING,&name,&signer->pasCertChain[0].pCert->pCertInfo->Subject)!=FALSE);}
};
void validateProductManifest(IAppxManifestReader* manifest){
 ComPtr<IStream> input;check(manifest->GetStream(&input));STATSTG stat{};check(input->Stat(&stat,STATFLAG_NONAME));require(stat.cbSize.QuadPart<=262144);LARGE_INTEGER zero{};check(input->Seek(zero,STREAM_SEEK_SET,nullptr));ComPtr<IXmlReader> xml;check(CreateXmlReader(__uuidof(IXmlReader),reinterpret_cast<void**>(xml.GetAddressOf()),nullptr));check(xml->SetProperty(XmlReaderProperty_DtdProcessing,DtdProcessing_Prohibit));check(xml->SetInput(input.Get()));
 fc_manifest::Node root;std::vector<fc_manifest::Node*> stack;unsigned nodes=0;size_t textSize=0;bool foundRoot=false;XmlNodeType type;HRESULT hr;
 auto local=[&](){LPCWSTR p=nullptr;UINT size=0;check(xml->GetLocalName(&p,&size));return std::wstring(p,size);};
 auto uri=[&](){LPCWSTR p=nullptr;UINT size=0;check(xml->GetNamespaceUri(&p,&size));return p?std::wstring(p,size):L"";};
 auto value=[&](){LPCWSTR p=nullptr;UINT size=0;check(xml->GetValue(&p,&size));textSize+=size;require(textSize<=262144);return p?std::wstring(p,size):L"";};
 while((hr=xml->Read(&type))==S_OK){
  if(type==XmlNodeType_Element){require(++nodes<=4096&&stack.size()<32);fc_manifest::Node node;node.name=local();node.uri=uri();const bool empty=xml->IsEmptyElement()!=FALSE;HRESULT attr=xml->MoveToFirstAttribute();unsigned count=0;
   while(attr==S_OK){require(++count<=64);const auto ns=uri();if(ns!=L"http://www.w3.org/2000/xmlns/")node.attributes.push_back({ns,local(),value()});attr=xml->MoveToNextAttribute();}check(attr);check(xml->MoveToElement());
   fc_manifest::Node* added=nullptr;if(stack.empty()){require(!foundRoot);foundRoot=true;root=std::move(node);added=&root;}else{stack.back()->children.push_back(std::move(node));added=&stack.back()->children.back();}if(!empty)stack.push_back(added);
  }else if(type==XmlNodeType_EndElement){require(!stack.empty());stack.pop_back();}
  else if(type==XmlNodeType_Text||type==XmlNodeType_CDATA||type==XmlNodeType_Whitespace||type==XmlNodeType_SignificantWhitespace){auto text=value();if(stack.empty())require(fc_manifest::trim(text).empty());else stack.back()->text+=text;}
  else require(type==XmlNodeType_Comment||type==XmlNodeType_XmlDeclaration);
 }
 check(hr);require(foundRoot&&stack.empty());fc_manifest::validate(root);
}
std::string inspectPackage(const std::wstring& path,const std::wstring& expectedName,const std::wstring& expectedPublisher){
 localPath(path);require(path.substr(path.find_last_of(L'\\')+1)==L"Explorer.msix"&&expectedName.size()>=3&&expectedName.size()<=50&&expectedPublisher.size()>0&&expectedPublisher.size()<=512);
 Handle locked;locked.h=CreateFileW(path.c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL|FILE_FLAG_OPEN_REPARSE_POINT,nullptr);if(locked.h==INVALID_HANDLE_VALUE)throw Failure{HRESULT_FROM_WIN32(GetLastError())};BY_HANDLE_FILE_INFORMATION info{};require(GetFileInformationByHandle(locked.h,&info)&&!(info.dwFileAttributes&(FILE_ATTRIBUTE_DIRECTORY|FILE_ATTRIBUTE_REPARSE_POINT)));LARGE_INTEGER length{};require(GetFileSizeEx(locked.h,&length)&&length.QuadPart>0&&length.QuadPart<=16*1024*1024);
 std::vector<wchar_t> resolved(32768);const DWORD resolvedSize=GetFinalPathNameByHandleW(locked.h,resolved.data(),static_cast<DWORD>(resolved.size()),FILE_NAME_NORMALIZED|VOLUME_NAME_DOS);require(resolvedSize>0&&resolvedSize<resolved.size());std::wstring finalPath(resolved.data(),resolvedSize);if(finalPath.rfind(L"\\\\?\\",0)==0)finalPath=finalPath.substr(4);require(CompareStringOrdinal(finalPath.c_str(),-1,path.c_str(),-1,TRUE)==CSTR_EQUAL);
 const auto sha256=hashFile(locked.h);LARGE_INTEGER zero{};require(SetFilePointerEx(locked.h,zero,nullptr,FILE_BEGIN)!=FALSE);Trust trust(path,locked.h);trust.publisher(expectedPublisher);
 require(SetFilePointerEx(locked.h,zero,nullptr,FILE_BEGIN)!=FALSE);std::vector<BYTE> snapshot(static_cast<size_t>(length.QuadPart));DWORD read=0;require(ReadFile(locked.h,snapshot.data(),static_cast<DWORD>(snapshot.size()),&read,nullptr)!=FALSE&&read==snapshot.size());
 // Parse the exact locked bytes, never reopen a potentially redirected path.
 ComPtr<IStream> stream;stream.Attach(SHCreateMemStream(snapshot.data(),static_cast<UINT>(snapshot.size())));require(stream!=nullptr);
 ComPtr<IAppxFactory> factory;check(CoCreateInstance(__uuidof(AppxFactory),nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&factory)));
 ComPtr<IAppxPackageReader> reader;check(factory->CreatePackageReader(stream.Get(),&reader));
 ComPtr<IAppxManifestReader> manifest;check(reader->GetManifest(&manifest));validateProductManifest(manifest.Get());ComPtr<IAppxManifestPackageId> id;check(manifest->GetPackageId(&id));Text name,publisher,family,full;check(id->GetName(&name.p));check(id->GetPublisher(&publisher.p));check(id->GetPackageFamilyName(&family.p));check(id->GetPackageFullName(&full.p));require(name.str()==expectedName);BOOL publisherMatches=FALSE;check(id->ComparePublisher(expectedPublisher.c_str(),&publisherMatches));require(publisherMatches!=FALSE);
 UINT64 version=0;APPX_PACKAGE_ARCHITECTURE architecture;check(id->GetVersion(&version));check(id->GetArchitecture(&architecture));const char* arch=architecture==APPX_PACKAGE_ARCHITECTURE_X64?"x64":architecture==APPX_PACKAGE_ARCHITECTURE_ARM64?"arm64":nullptr;require(arch!=nullptr);
 ComPtr<IAppxBlockMapReader> blockMap;check(reader->GetBlockMap(&blockMap));ComPtr<IAppxBlockMapFilesEnumerator> files;check(blockMap->GetFiles(&files));BOOL has=FALSE;check(files->GetHasCurrent(&has));UINT64 expanded=0;unsigned count=0;bool manifestMapped=false;std::set<std::wstring> names;
 while(has){require(++count<=512);ComPtr<IAppxBlockMapFile> mapped;check(files->GetCurrent(&mapped));Text fileName;check(mapped->GetName(&fileName.p));const auto filename=fileName.str();require(!filename.empty()&&filename.size()<=32768&&names.insert(filename).second);UINT64 size=0;check(mapped->GetUncompressedSize(&size));require(size<=16*1024*1024&&(expanded+=size)<=64*1024*1024);ComPtr<IAppxFile> file;
  if(filename==L"AppxManifest.xml"){manifestMapped=true;check(reader->GetFootprintFile(APPX_FOOTPRINT_FILE_TYPE_MANIFEST,&file));}else check(reader->GetPayloadFile(filename.c_str(),&file));
  UINT64 actual=0;check(file->GetSize(&actual));require(actual==size);ComPtr<IStream> contents;check(file->GetStream(&contents));BOOL valid=FALSE;check(mapped->ValidateFileHash(contents.Get(),&valid));require(valid!=FALSE);check(files->MoveNext(&has));
 }
 require(manifestMapped);fc_manifest::validateAssets(names);
 const std::string versionText=std::to_string((version>>48)&65535)+"."+std::to_string((version>>32)&65535)+"."+std::to_string((version>>16)&65535)+"."+std::to_string(version&65535);
 return "{\"version\":1,\"kind\":\"package\",\"verified\":true,\"signatureVerified\":true,\"manifestValidated\":true,\"blockMapValidated\":true,\"productManifestValidated\":true,\"sha256\":\""+sha256+"\",\"path\":"+json(path)+",\"identity\":{\"verified\":true,\"name\":"+json(name.str())+",\"publisher\":"+json(publisher.str())+",\"familyName\":"+json(family.str())+",\"fullName\":"+json(full.str())+",\"version\":\""+versionText+"\",\"architecture\":\""+arch+"\"},\"validatedFiles\":"+std::to_string(count)+"}";
}
std::string externalLocation(const std::wstring& fullName){require(!fullName.empty()&&fullName.size()<=512&&fullName.find_first_of(L"\\/\r\n\t")==std::wstring::npos);UINT32 size=0;LONG result=GetPackagePathByFullName2(fullName.c_str(),PackagePathType_EffectiveExternal,&size,nullptr);require(result==ERROR_INSUFFICIENT_BUFFER&&size>1&&size<=32768);std::vector<wchar_t> value(size);result=GetPackagePathByFullName2(fullName.c_str(),PackagePathType_EffectiveExternal,&size,value.data());if(result!=ERROR_SUCCESS)throw Failure{HRESULT_FROM_WIN32(result)};require(size>1&&size<=value.size()&&value[size-1]==0);const std::wstring location(value.data(),size-1);localPath(location);return "{\"version\":1,\"kind\":\"registered-location\",\"locationVerified\":true,\"packageIdentityVerified\":false,\"fullName\":"+json(fullName)+",\"externalLocation\":"+json(location)+"}";}
}
int wmain(int argc,wchar_t** argv){const HRESULT init=CoInitializeEx(nullptr,COINIT_MULTITHREADED);if(FAILED(init)){std::cout<<"{\"verified\":false,\"error\":\"com-initialization\"}\n";return 1;}struct Uninit{~Uninit(){CoUninitialize();}}uninit;
 try{std::string result;if(argc==5&&std::wstring(argv[1])==L"package")result=inspectPackage(argv[2],argv[3],argv[4]);else if(argc==3&&std::wstring(argv[1])==L"external-location")result=externalLocation(argv[2]);else throw Failure{E_INVALIDARG};std::cout<<result<<"\n";return 0;}catch(const Failure& e){std::cout<<"{\"verified\":false,\"error\":\"inspection-failed\",\"hresult\":"<<static_cast<unsigned long>(e.code)<<"}\n";return 1;}catch(...){std::cout<<"{\"verified\":false,\"error\":\"inspection-failed\"}\n";return 1;}
}
