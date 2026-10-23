# Further Compare 2.8

## Rename files and folders

Rename an entry through its context menu, Actions menu, or F2. Renaming an expanded folder preserves its expanded descendants and selects the new path. The opposite tree retains its original paths. Open text tabs and nested folder sessions follow renamed source paths while preserving unsaved edits and editing history.

Existing destination names are rejected. On macOS, a bundled universal helper uses exclusive directory rename with directory handles and no-follow traversal. On Windows, a fixed PowerShell/C# helper uses directory handles and a non-replacing rename operation. User paths are passed as data, not shell commands. Unsupported filesystems or environments that block the helper report an error rather than falling back to an overwriting operation.

Building on macOS requires the Apple command-line developer tools to compile the helper. The packaged app includes it. Windows uses the built-in Windows PowerShell runtime; native Windows execution remains unverified on this development Mac.

## Clipboard comparison

Use **Compare Clipboard in New Session** from Edit or the desktop start screen. The clipboard text opens on the left with an empty right pane. **Paste Clipboard to Left/Right** replaces the corresponding text pane and participates in comparison undo/redo.

Clipboard reads occur only after these explicit actions. Empty, oversized, and binary clipboard contents leave the existing comparison unchanged. Pasting into an open file marks the text edited; it does not write the file. The browser continues to open directly in the text workspace.

## Startup readiness

Controls remain inactive until initialization finishes, preventing early launch-screen clicks from being lost on slower startup. A delayed-script browser regression verifies this behavior.

## Validation

All 81 unit tests passed. Targeted native regression suites covered desktop sessions and filesystem operations, folder layouts, renaming, clipboard actions, and text history; browser workspace and delayed-startup checks passed. Both actual packaged Mac variants passed the rename workflow, including the bundled helper and open-child-tab path updates. The Intel package ran through compatibility execution on the development Apple Silicon Mac. All three downloads passed SHA-256 and size checks. Windows native runtime verification remains pending.

## Remaining scope

This release continues the full-product work. Remote sources, archive writeback, live registry access, advanced rules, three-way folder merging, and the other unfinished entries in `implementation-plan.json` are still outstanding.
