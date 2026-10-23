# Native keyboard validation — 2.121.1

Validated on macOS on 2026-10-21 using the packaged Apple Silicon app at `release/mac-arm64/Further Compare.app` and real desktop keyboard input through CUA. The desktop was available after the user unlocked it.

- Opened a blank Text Compare session and typed `Keyboard validation` into the left editor. The accessibility tree showed the typed text and one live difference without a separate comparison action.
- Pressed Cmd+F. Find opened with focus in its search field.
- Typed a search term, then pressed Escape. Find closed and focus returned to the left editor.
- Selected all and typed `Replacement text`. Cmd+Z removed the final typed character, producing `Replacement tex`; Cmd+Shift+Z restored `Replacement text`. These checks verify native editor undo/redo, not the separate section-copy history controls.
- Enabled Wrap, opened the new-session chooser, and returned to the existing text tab. Wrap remained enabled and the edited text remained present.

Only synthetic unsaved text was entered; no source file was modified. This is a focused Mac keyboard smoke check, not verification of all shortcuts or Windows keyboard behavior. No production code or release artifact changed.

## Folder workflow

Continued with synthetic temporary folders containing three differing root files and `java/oracle/project/main.txt` on both sides. Loaded both roots by pasting paths into the packaged app and pressing Return.

- Native pointer click selected a root file without opening a comparison. Command-click added a second file; the accessibility tree reported exactly those two rows selected.
- Shift+F10 opened Folder actions with both rows still selected and the single-file Open comparison and Rename actions disabled.
- Escape dismissed the menu. Home selected the first folder and Right expanded the complete `java/oracle/project` single-child chain inline, exposing the differing file on both sides and propagating loaded difference status to its parents.
- Typing `g` selected `gamma.txt` without opening it. A native double-click then opened exactly one child text tab containing the left and right fixture contents; the parent folder tab remained available.
- Screenshot inspection confirmed compact rows, three columns (Name, Size, Last modified), pastel difference backgrounds and dark filename text, with no selection checkboxes.

The current-source `test/folder-selection-desktop.cjs` regression also passed, covering modifier/range selection, independent keyboard focus, hidden anchors, native action targeting, and parent preservation.

The current-source `test/folder-context-menu-desktop.cjs` regression passed: grouped action inventory, compact top level, disabled-action skipping, submenu keyboard traversal, focus restoration, hover switching, dismissal, multi-selection, selection-rule side focus and Shift anchors, empty matches, root picker cancellation/side routing, and light/dark menu edge placement.
