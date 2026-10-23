#pragma once
#include "SelectionPolicy.hpp"
namespace further_compare::explorer {
// SFGAO_FOLDER describes browsability, not necessarily a disk directory.
// A filesystem ZIP can also have SFGAO_STREAM: classify that as a file.
// No SFGAO_FILESYSTEM means a virtual item, even when it exposes a stream.
inline Kind kindFromShellMetadata(bool filesystem,bool folder,bool stream) {
  if(!filesystem)return Kind::Virtual;
  return folder&&!stream?Kind::Folder:Kind::File;
}
}
