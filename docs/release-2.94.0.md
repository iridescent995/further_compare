# Release 2.94.0 — saved session defaults

File → Session Defaults and folder right-click → Session & tools → Session defaults let users review and save the current comparison's reusable preferences. The dialog shows readable labels, with the exact configuration in a collapsed details section. Save replaces defaults for that type; Reset removes that profile and restores built-in settings for future sessions.

Text, folder, folder sync, binary, table, picture, audio and registry comparison types have separate profiles. New tabs and comparisons opened from folder entries or file-manager requests use their type's defaults. Open tabs retain their existing preferences, and restored sessions and workspaces retain their saved settings. Clearing a comparison creates an empty session using the current defaults.

Profiles contain comparison rules and view preferences only. File paths, contents, search/replacement text, bookmarks, alignment pairs, pending operations, and file-derived formats are excluded. Native storage validates a strict type-specific schema, limits the entire store to 128 KiB, serializes changes, writes atomically, rejects symlink/hardlink targets, and rejects a save/reset when the reviewed profile has changed.

Archive and three-way types currently have no content-independent defaults. Session defaults are not yet included in application-settings export/import.

Source validation: all 745 unit tests passed. Dialog browser checks passed. Electron workflow passed text wrap/rules, empty new sessions, search exclusion, existing-tab preservation, reset, saved-session precedence, folder masks/rules/view, stale native and dialog guards, picture/table defaults, and opening a table from the folder tree. Folder selection and chain expansion regressions passed. Both Mac packages passed the defaults workflow. The packaged dialog was visually inspected. All three package versions and assets match source, and all ZIP integrity checks passed. Download links, sizes, SHA-256 and a Windows ZIP browser download passed. No reference branding was found in shipped source.

Windows runtime and full product parity remain incomplete.
