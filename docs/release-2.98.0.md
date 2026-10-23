# Release 2.98.0 — compact editable comparison

The editable text panes are the comparison workspace. Differences update after typing; the separate Edit and Compare view buttons have been removed. Word wrap remains part of the session through comparison updates, filters, tab switching, replace and merge operations.

Everyday editing controls now share the main toolbar. Display filters, comparison rules, manual alignment, file formats and desktop clipboard/file-manager controls are grouped in a borderless options dialog. Find adds a row only while open. Slimmer toolbar, footer and status spacing give the text more room while preserving equal-width panes.

The desktop also gains independent comparison windows. Native session state, authority tokens, cancellation and plans belong to their originating window. Filesystem and shared preference operations remain serialized. Native menus route to the focused window; cross-window renames update paths without replacing unsaved text.

Validation: all 783 unit tests passed. Browser checks passed automatic comparison, wrap retention, replacement, tab restoration, smaller viewport layout, equal pane widths, and virtualized wrapped-line geometry with 10,000 lines. Desktop/package verification is recorded after completion below. Windows runtime remains unverified.

Final validation: both Apple Silicon and Intel Mac packages passed live-edit comparison, retained wrap, merge/undo/redo, tab restoration, replacement, filters and compact viewport checks. Source multiwindow isolation and folder-chain expansion regressions passed. All three package versions/assets matched source; ZIP integrity, download links, sizes, SHA-256 and Windows ZIP browser download passed. Light/dark browser and options dialog screenshots were inspected. No reference branding was found in shipped source.
