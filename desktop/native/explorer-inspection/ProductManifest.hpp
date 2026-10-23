#pragma once
#include <string>
#include <vector>
#include <set>
#include <stdexcept>
#include <initializer_list>
#include <utility>
namespace fc_manifest {
inline const std::wstring F=L"http://schemas.microsoft.com/appx/manifest/foundation/windows10",U=L"http://schemas.microsoft.com/appx/manifest/uap/windows10",U10=L"http://schemas.microsoft.com/appx/manifest/uap/windows10/10",C=L"http://schemas.microsoft.com/appx/manifest/com/windows10",D4=L"http://schemas.microsoft.com/appx/manifest/desktop/windows10/4",D5=L"http://schemas.microsoft.com/appx/manifest/desktop/windows10/5",RC=L"http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities";
inline const std::wstring CLSID=L"b93d608a-f29e-4b13-a268-0b0729a4ded8";
struct Attribute{std::wstring uri,name,value;};
struct Node{std::wstring uri,name,text;std::vector<Attribute> attributes;std::vector<Node> children;};
inline void require(bool value){if(!value)throw std::invalid_argument("Unexpected Further Compare package manifest binding.");}
inline std::wstring lower(std::wstring value){for(auto& c:value)if(c>=L'A'&&c<=L'Z')c+=L'a'-L'A';return value;}
inline std::wstring trim(std::wstring value){const auto a=value.find_first_not_of(L" \t\r\n"),b=value.find_last_not_of(L" \t\r\n");return a==std::wstring::npos?L"":value.substr(a,b-a+1);}
inline std::wstring attr(const Node& n,const std::wstring& name,const std::wstring& uri=L""){std::wstring value;unsigned found=0;for(const auto& a:n.attributes)if(a.name==name&&a.uri==uri){value=a.value;++found;}require(found==1);return value;}
inline void attrs(const Node& n,std::initializer_list<std::pair<std::wstring,std::wstring>> allowed){std::set<std::pair<std::wstring,std::wstring>> seen;for(const auto& a:n.attributes){const auto key=std::make_pair(a.uri,a.name);require(seen.insert(key).second);bool valid=false;for(const auto& pair:allowed)if(key==pair)valid=true;require(valid);}}
inline const Node& one(const Node& n,const std::wstring& name,const std::wstring& uri){const Node* found=nullptr;for(const auto& c:n.children)if(c.name==name&&c.uri==uri){require(found==nullptr);found=&c;}require(found!=nullptr);return *found;}
inline void children(const Node& n,std::initializer_list<std::pair<std::wstring,std::wstring>> allowed){require(trim(n.text).empty());for(const auto& c:n.children){bool valid=false;for(const auto& p:allowed)if(c.uri==p.first&&c.name==p.second)valid=true;require(valid);}}
inline void leaf(const Node& n){require(n.children.empty()&&trim(n.text).empty());}
inline std::vector<unsigned> version(const std::wstring& text){std::vector<unsigned> result;unsigned value=0,digits=0;for(wchar_t c:text){if(c==L'.'){require(digits>0);result.push_back(value);value=digits=0;}else{require(c>=L'0'&&c<=L'9');value=value*10+static_cast<unsigned>(c-L'0');require(value<=65535&&++digits<=5);}}require(digits>0);result.push_back(value);require(result.size()==4);return result;}
inline void validate(const Node& root){
 require(root.uri==F&&root.name==L"Package");children(root,{{F,L"Identity"},{F,L"Properties"},{F,L"Resources"},{F,L"Dependencies"},{F,L"Applications"},{F,L"Capabilities"}});
 const auto& identity=one(root,L"Identity",F);attrs(identity,{{L"",L"Name"},{L"",L"Publisher"},{L"",L"Version"},{L"",L"ProcessorArchitecture"}});leaf(identity);
 // Signed identity is independently compared using IAppxManifestPackageId.
 const auto& props=one(root,L"Properties",F);children(props,{{F,L"DisplayName"},{F,L"PublisherDisplayName"},{F,L"Logo"},{U10,L"AllowExternalContent"}});
 for(const auto& name:{L"DisplayName",L"PublisherDisplayName",L"Logo"}){const auto& n=one(props,name,F);require(n.children.empty()&&n.attributes.empty()&&!trim(n.text).empty());}
 require(trim(one(props,L"Logo",F).text)==L"Assets\\StoreLogo.png");const auto& external=one(props,L"AllowExternalContent",U10);require(external.children.empty()&&external.attributes.empty()&&trim(external.text)==L"true");
 const auto& resources=one(root,L"Resources",F);children(resources,{{F,L"Resource"}});require(!resources.children.empty());for(const auto& n:resources.children){attrs(n,{{L"",L"Language"}});require(!attr(n,L"Language").empty());leaf(n);}
 const auto& deps=one(root,L"Dependencies",F);children(deps,{{F,L"TargetDeviceFamily"}});require(deps.children.size()==1);const auto& device=deps.children[0];attrs(device,{{L"",L"Name"},{L"",L"MinVersion"},{L"",L"MaxVersionTested"}});require(attr(device,L"Name")==L"Windows.Desktop"&&version(attr(device,L"MinVersion"))>=std::vector<unsigned>({10,0,22000,0}));leaf(device);
 const auto& caps=one(root,L"Capabilities",F);children(caps,{{RC,L"Capability"}});std::set<std::wstring> capabilities;for(const auto& n:caps.children){attrs(n,{{L"",L"Name"}});leaf(n);const auto name=attr(n,L"Name");require(name==L"runFullTrust"||name==L"unvirtualizedResources");require(capabilities.insert(name).second);}require(capabilities.size()==2);
 const auto& apps=one(root,L"Applications",F);children(apps,{{F,L"Application"}});require(apps.children.size()==1);const auto& app=apps.children[0];attrs(app,{{L"",L"Id"},{L"",L"Executable"},{U10,L"TrustLevel"},{U10,L"RuntimeBehavior"}});require(attr(app,L"Id")==L"FurtherCompare"&&attr(app,L"Executable")==L"Further Compare.exe"&&attr(app,L"TrustLevel",U10)==L"mediumIL"&&attr(app,L"RuntimeBehavior",U10)==L"win32App");children(app,{{U,L"VisualElements"},{F,L"Extensions"}});
 const auto& visual=one(app,L"VisualElements",U);attrs(visual,{{L"",L"DisplayName"},{L"",L"Description"},{L"",L"BackgroundColor"},{L"",L"Square150x150Logo"},{L"",L"Square44x44Logo"}});require(attr(visual,L"Square150x150Logo")==L"Assets\\Square150x150Logo.png"&&attr(visual,L"Square44x44Logo")==L"Assets\\Square44x44Logo.png");leaf(visual);
 const auto& extensions=one(app,L"Extensions",F);children(extensions,{{C,L"Extension"},{D4,L"Extension"}});require(extensions.children.size()==2);
 const auto& com=one(extensions,L"Extension",C);attrs(com,{{L"",L"Category"}});require(attr(com,L"Category")==L"windows.comServer");children(com,{{C,L"ComServer"}});require(com.children.size()==1);const auto& server=one(com,L"ComServer",C);attrs(server,{});children(server,{{C,L"SurrogateServer"}});require(server.children.size()==1);const auto& surrogate=one(server,L"SurrogateServer",C);attrs(surrogate,{{L"",L"DisplayName"}});children(surrogate,{{C,L"Class"}});require(surrogate.children.size()==1);const auto& cls=surrogate.children[0];attrs(cls,{{L"",L"Id"},{L"",L"Path"},{L"",L"ThreadingModel"}});leaf(cls);require(lower(attr(cls,L"Id"))==CLSID&&attr(cls,L"Path")==L"FurtherCompareExplorer.dll"&&attr(cls,L"ThreadingModel")==L"STA");
 const auto& shell=one(extensions,L"Extension",D4);attrs(shell,{{L"",L"Category"}});require(attr(shell,L"Category")==L"windows.fileExplorerContextMenus");children(shell,{{D4,L"FileExplorerContextMenus"}});require(shell.children.size()==1);const auto& menus=shell.children[0];attrs(menus,{});children(menus,{{D5,L"ItemType"}});require(menus.children.size()==2);std::set<std::wstring> contexts;
 for(const auto& item:menus.children){attrs(item,{{L"",L"Type"}});const auto type=attr(item,L"Type");require((type==L"*"||type==L"Directory")&&contexts.insert(type).second);children(item,{{D5,L"Verb"}});require(item.children.size()==1);const auto& verb=item.children[0];attrs(verb,{{L"",L"Id"},{L"",L"Clsid"}});leaf(verb);require(attr(verb,L"Id")==L"FurtherCompare"&&lower(attr(verb,L"Clsid"))==CLSID);}
}
inline void validateAssets(const std::set<std::wstring>& files){for(const auto& name:{L"Assets\\StoreLogo.png",L"Assets\\Square150x150Logo.png",L"Assets\\Square44x44Logo.png"})require(files.count(name)==1);}
}
