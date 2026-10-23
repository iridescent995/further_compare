# Release 2.109.0 — binary history across tabs

Native Undo/Redo Comparison Edit now uses the binary editor’s history. Byte edits, copied differences, insertions, deletions and replacements share the same bounded history as the toolbar. Switching between binary, text and archive tabs preserves each binary tab’s independent undo and redo branches.

Runtime snapshots are opaque, immutable and bound to their creating editor and exact input pair. Replacing either input clears history; stale, forged and serialized snapshots are ignored. Saved sessions and workspaces contain current bytes but no transient edit history. Archive child undo changes the child editor until Apply to archive is used; the parent retains its own separate history.

Selecting an archive row previously caused its toolbar count to wrap at some window widths, shifting the row during a double-click. The count now reserves its space; selection and double-click opening passed at eight widths from 800 to 1600 pixels.

Final validation: 896 unit tests passed, one Windows-native test skipped. Source and both Mac packages passed native-menu undo/redo, mixed edits, exact bytes, independent tabs, saved-session/replacement resets and independent archive child/parent history. The initial packaged archive-entry failures led to the selection-count layout fix above. Isolated runtime, binary range, archive entry, workspace, folder selection, node refresh and automatic chain expansion checks passed. All three package versions/UI/CSS, ZIP integrity, download links/sizes/SHA-256 and browser download checks passed. No reference branding was found in shipped source. Windows runtime and remaining full-product scope stay open.
