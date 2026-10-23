# Further Compare 2.17

## External editor

Right-click one file in a folder comparison and choose **Open in external editor…**. The native Actions menu offers the same command. Text comparisons also have **File → Open Left/Right in External Editor**. Folder File-menu commands use the single selected file on the corresponding side.

Configure **File → External Editor…** to use the system default application or a chosen editor. A custom executable accepts arguments entered one per line; `{file}` is replaced with the full file path. If omitted, the path is appended. Mac application bundles receive the file automatically and do not accept `{file}` in their extra arguments. Windows custom editors must be `.exe` files. Arguments are passed directly, without a shell.

The external application opens the saved disk file. Unsaved comparison text remains in its tab. Existing disk-change detection reloads unedited text; edited text is preserved with a change notice. Folder results update through normal node comparison and refresh. Settings persist across restarts. Missing files/editors and failed Mac application launches report an error.

The native layer resolves files from the active text session or selected folder root, verifies regular files and rechecks their identity before launch. It does not accept arbitrary file paths supplied by renderer metadata. Advanced inputs can be opened externally through their original folder entry; direct advanced-input launching and editor profiles remain planned.

## Validation

All 136 unit tests pass. The desktop integration suite covers native left/right actions, right-click selected-side behavior including file/folder conflicts, rejected path traversal/directories, missing files, saved preferences across restart, literal shell punctuation in arguments, actual execution of a temporary Mac editor, automatic reload, and preservation of unsaved text.

The suite passed in development and in Apple Silicon and Intel Mac packages. After the final dialog-width and settings-size fixes, development integration and all unit tests passed again. The refreshed dialog was visually inspected.

Windows runtime verification and broader full-product scope remain open.
