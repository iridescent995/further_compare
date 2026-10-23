# Release 2.91.1 — sync method context menus

Folder Sync now exposes Mirror folders, Update newer files and Update both sides through right-click → Synchronize → Sync method. The selected method is disabled in the menu. Update both sides disables both Direction choices, matching the toolbar's hidden direction selector. Method changes use existing session persistence and guarded preview paths. The top-level context menu stays compact.

A current-state audit passed all 712 unit tests, followed by source Electron inline-tree, modifier/range selection, synchronization and compact context-menu tests. An independent source review found no actionable defects. The synchronization runtime test now changes methods through the actual nested context menu, verifies previews, tab restoration and saved-session reopening, and checks disabled bidirectional direction choices.

Both final Apple Silicon and Intel Mac packages passed that workflow. All three Mac/Windows package versions and changed assets match source; ZIP integrity checks passed. Download links, sizes, SHA-256 and a Windows ZIP browser download passed. The shipped source contains no reference-product branding.

Windows runtime verification and the remaining full-product feature scope are still incomplete.
