#pragma once
// Pure UTF-16 boundary for the future Explorer COM command implementation.
// No filesystem, registry, process launch, or global Explorer selection access.
#include <cstddef>
#include <stdexcept>
#include <string>
#include <vector>

namespace further_compare::explorer {
enum class Kind { File, Folder, Virtual };
struct Item { std::u16string path; Kind kind; };
enum class LeftState { Unknown, Available, Unavailable };
// Display metadata is advisory. The host must revalidate authoritative left state.
struct LeftHint { LeftState state = LeftState::Unknown; Kind kind = Kind::Virtual; };
enum class Reason { None, NoSelection, TooMany, UnsupportedItem, InvalidPath, MixedKinds, LeftUnavailable, LeftKindMismatch };
struct MenuPolicy {
  bool setLeft = false;
  bool compareLeft = false;
  bool compareSelected = false;
  Reason reason = Reason::None;
};
constexpr std::size_t MaxPathUnits = 32768;
// CreateProcessW maximum includes the terminating NUL.
constexpr std::size_t MaxCommandLineUnits = 32766;

inline bool asciiLetter(char16_t c) { return (c >= u'A' && c <= u'Z') || (c >= u'a' && c <= u'z'); }
inline bool validUTF16(const std::u16string& value) {
  for (std::size_t i=0; i<value.size(); ++i) {
    const auto c=value[i];
    if(c>=0xD800 && c<=0xDBFF) { if(++i>=value.size() || value[i]<0xDC00 || value[i]>0xDFFF) return false; }
    else if(c>=0xDC00 && c<=0xDFFF) return false;
  }
  return true;
}
inline bool absoluteFilesystemPath(const std::u16string& value) {
  if(value.empty() || value.size()>MaxPathUnits || !validUTF16(value)) return false;
  // Explorer filesystem paths use backslashes. Reject device namespaces and
  // unsupported shell identifiers; never reinterpret them as filesystem items.
  std::u16string path=value;
  if(path.compare(0,8,u"\\\\?\\UNC\\")==0) path=u"\\\\"+path.substr(8);
  else if(path.compare(0,4,u"\\\\?\\")==0) {
    path=path.substr(4);
    if(path.size()<3 || !asciiLetter(path[0]) || path[1]!=u':' || path[2]!=u'\\') return false;
  }
  for(std::size_t i=0;i<path.size();++i) {
    const auto c=path[i];
    if(c<32 || c==u'"' || c==u'<' || c==u'>' || c==u'|' || c==u'*' || c==u'?' || c==u'/' || (c==u':' && i!=1)) return false;
  }
  if(path.size()>=3 && asciiLetter(path[0]) && path[1]==u':' && path[2]==u'\\') return true;
  if(path.size()<5 || path[0]!=u'\\' || path[1]!=u'\\') return false;
  const auto serverEnd=path.find(u'\\',2);
  if(serverEnd==std::u16string::npos || serverEnd==2 || serverEnd+1==path.size()) return false;
  const auto server=path.substr(2,serverEnd-2);
  if(server==u"." || server==u"..") return false;
  const auto shareEnd=path.find(u'\\',serverEnd+1);
  const auto share=path.substr(serverEnd+1,shareEnd==std::u16string::npos?shareEnd:shareEnd-serverEnd-1);
  return !share.empty() && share!=u"." && share!=u"..";
}
inline MenuPolicy selectionPolicy(const std::vector<Item>& items, LeftHint left={}) {
  MenuPolicy result;
  if(items.empty()) { result.reason=Reason::NoSelection; return result; }
  if(items.size()>2) { result.reason=Reason::TooMany; return result; }
  for(const auto& item:items) {
    if(item.kind!=Kind::File && item.kind!=Kind::Folder) { result.reason=Reason::UnsupportedItem; return result; }
    if(!absoluteFilesystemPath(item.path)) { result.reason=Reason::InvalidPath; return result; }
  }
  if(items.size()==2) {
    if(items[0].kind!=items[1].kind) result.reason=Reason::MixedKinds;
    else result.compareSelected=true;
    return result;
  }
  result.setLeft=true;
  if(left.state==LeftState::Unavailable) result.reason=Reason::LeftUnavailable;
  else if(left.state==LeftState::Available && left.kind!=items[0].kind) result.reason=Reason::LeftKindMismatch;
  else result.compareLeft=true; // Unknown hint: generic label; host resolves state.
  return result;
}
enum class Action { SetLeft, CompareLeft, CompareSelected };
class Request {
 public:
  Request(Action action, const std::vector<Item>& items, LeftHint left={}) : action_(action), items_(items) {
    const auto policy=selectionPolicy(items_,left);
    if(!((action==Action::SetLeft && policy.setLeft) || (action==Action::CompareLeft && policy.compareLeft) || (action==Action::CompareSelected && policy.compareSelected)))
      throw std::invalid_argument("Selection does not support this Explorer command.");
  }
  Action action() const { return action_; }
  const std::vector<Item>& items() const { return items_; }
  std::u16string flag() const {
    if(action_==Action::SetLeft) return u"--fc-set-left";
    if(action_==Action::CompareLeft) return u"--fc-compare-left";
    return u"--fc-compare-selected";
  }
 private:
  Action action_;
  std::vector<Item> items_; // Deep copy: menu/invocation caller cannot replace paths.
};
inline std::u16string quoteWindowsArgument(const std::u16string& value) {
  if(!validUTF16(value) || value.find(char16_t(0))!=std::u16string::npos || value.size()>MaxCommandLineUnits)
    throw std::invalid_argument("Invalid Windows argument.");
  std::u16string result(1,u'"');std::size_t slashes=0;
  for(const auto c:value) {
    if(c==u'\\') { ++slashes;continue; }
    if(c==u'"') result.append(slashes*2+1,u'\\');
    else result.append(slashes,u'\\');
    slashes=0;result.push_back(c);
  }
  result.append(slashes*2,u'\\');result.push_back(u'"');return result;
}
inline std::u16string commandLine(const std::u16string& installedExecutable, const Request& request) {
  if(!absoluteFilesystemPath(installedExecutable)) throw std::invalid_argument("Invalid installed executable path.");
  auto leaf=installedExecutable.substr(installedExecutable.find_last_of(u'\\')+1);
  for(auto& c:leaf) if(c>=u'A' && c<=u'Z') c+=u'a'-u'A';
  if(leaf!=u"further compare.exe") throw std::invalid_argument("Unexpected installed executable.");
  auto result=quoteWindowsArgument(installedExecutable)+u" "+request.flag();
  for(const auto& item:request.items()) {
    const auto argument=quoteWindowsArgument(item.path);
    if(result.size()+1+argument.size()>MaxCommandLineUnits) throw std::length_error("Explorer selection exceeds the Windows command-line limit.");
    result+=u" "+argument;
  }
  if(result.size()>MaxCommandLineUnits) throw std::length_error("Windows command line is too long.");
  // Caller must supply installedExecutable separately as CreateProcessW
  // lpApplicationName and use a mutable NUL-terminated copy of this result.
  return result;
}
} // namespace further_compare::explorer
