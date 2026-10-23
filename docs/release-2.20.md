# Further Compare 2.20.0

Folder entries now offer explicit text, binary, table, picture, audio, archive and registry comparison choices in the right-click menu and Actions → Open As. These choices override extension-based routing. Single-click still selects, and double-click still selects a comparison type automatically.

Select one file to open a child comparison. Directories, multiple selections and file/folder conflicts cannot use these actions. The parent folder tab and its roots remain available. Explicit text comparisons retain native save and reload access to the selected files.

Each comparison engine still validates its supported formats and size limits. Choosing an engine does not convert a file to that format. Context-menu separators distinguish comparison choices, expansion, file operations and view options using the current theme.

All 153 local unit tests and the existing advanced desktop regression pass. The new desktop test verifies all seven engines with real fixtures, including PNG/WAV/ZIP/REG contents under unfamiliar extensions, forced text save/reload, native binary dispatch, keyboard traversal, selection restrictions, and retained folder roots.

Both final Mac packages pass the new integration test. All three package versions, menu/preload code, renderer and theme match source. ZIP integrity and browser download link, size and SHA-256 checks pass.

The full-product scope remains in progress, including native Windows runtime verification.
