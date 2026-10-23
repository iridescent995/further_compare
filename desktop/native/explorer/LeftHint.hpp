#pragma once
#include "SelectionPolicy.hpp"
#include <cstdint>
namespace further_compare::explorer {
constexpr std::size_t MaxLeftHintNameUnits=96;
constexpr std::size_t MaxLeftHintBytes=10+2*MaxLeftHintNameUnits;
struct DisplayLeftHint { LeftHint policy{}; std::u16string name; };
inline bool unsafeHintCharacter(char16_t c) {
 return c<0x20||(c>=0x7F&&c<=0x9F)||c==0x061C||c==0x200E||c==0x200F||
        (c>=0x2028&&c<=0x202E)||(c>=0x2066&&c<=0x206F);
}
// One atomic, bounded registry value. Invalid bytes mean unknown, never a
// trusted path or permission to access a remembered item.
inline DisplayLeftHint decodeLeftHint(const std::vector<std::uint8_t>& bytes) {
 DisplayLeftHint unknown;
 if(bytes.size()<10||bytes.size()>MaxLeftHintBytes||bytes[0]!='F'||bytes[1]!='C'||bytes[2]!='L'||bytes[3]!='H'||bytes[4]!=1||bytes[5]!=0||bytes[6]>2||bytes[7]>1)return unknown;
 const std::size_t count=bytes[8]|(std::size_t(bytes[9])<<8);
 if(count>MaxLeftHintNameUnits||bytes.size()!=10+2*count)return unknown;
 if(bytes[6]==0&&(bytes[7]!=0||count!=0))return unknown;
 std::u16string name;name.reserve(count);
 for(std::size_t i=0;i<count;++i){const char16_t c=static_cast<char16_t>(bytes[10+2*i]|(std::uint16_t(bytes[11+2*i])<<8));if(unsafeHintCharacter(c))return unknown;name.push_back(c);}
 if(!validUTF16(name))return unknown;
 return {{bytes[7]?LeftState::Available:LeftState::Unavailable,bytes[6]==1?Kind::File:bytes[6]==2?Kind::Folder:Kind::Virtual},name};
}
inline std::u16string compareLeftTitle(const DisplayLeftHint& hint) {
 if(hint.policy.state==LeftState::Unknown||hint.name.empty())return u"Compare with Left";
 std::u16string title=u"Compare with \u201c";
 for(const auto c:hint.name){title.push_back(c);if(c==u'&')title.push_back(u'&');}
 return title+u"\u201d";
}
inline bool leftHintAllows(Kind selected,const DisplayLeftHint& hint) {
 return hint.policy.state==LeftState::Unknown || (hint.policy.state==LeftState::Available&&hint.policy.kind==selected);
}
}
