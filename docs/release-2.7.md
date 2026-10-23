# Further Compare 2.7

## Archives

Archive Compare opens ZIP and JAR files in a paired inline tree. Each side shows Name, Size, and Modified. Click selects; double-click expands a directory or opens a file comparison in a child tab. Right-click offers the applicable open/expand/collapse and report actions. Back to archive returns to the parent tab and its expanded tree.

Only immediate files in opened nodes are compared. The JSON report explicitly describes this scope; a collapsed directory does not imply that all descendants match. Comparisons and entry opening operate in memory and do not extract or rewrite the archive. Supported compression methods are stored and deflate, with 32 MB input, 64 MB expanded-content, and 50,000-entry limits. CRC is verified when content is read. Unsafe paths, symlinks, special entries, duplicates, overlapping entries, encrypted archives, and ZIP64 are rejected. ZIP timestamps retain their stored wall-clock fields without an inferred timezone.

## Exported registry files

Registry Compare works with exported `.reg` files on the desktop app. It compares key/value names case-insensitively, shows matching and differing entries, and supports strings, DWORDs, typed byte sequences, and deletion records. Initialize a result from either side, copy selected entries into it, or edit the result text before export.

Version 5 and REGEDIT4 syntax is supported with UTF-8 or UTF-16LE encoding, up to 10 MB and 100,000 key/value entries. Ambiguous duplicate entries and malformed syntax are rejected. Result export validates the data and writes a UTF-16LE file with a BOM. The app does not access or modify the live registry and does not import the exported file automatically.

## Folder navigation

- **Loaded files** presents files from already browsed nodes as a flat list. Return to Tree and expand more folders to include more entries; this view is not an automatic recursive scan.
- Sort by name, path, left/right size, or left/right modification time, in ascending or descending order. View and sorting preferences persist in saved sessions.
- Child file comparisons can return to their open folder or archive parent. Existing open-tab browsing state is retained; the parent relationship is not a portable path-history system.
- **New File** creates an empty file on the selected side using exclusive creation. Existing entries are preserved; filenames and the selected directory are validated.

## Shared commands

Swap Sides now preserves selected workbook sheets, audio offset direction, and registry result text. Three-way merge selections retain their source meaning and combined text order, including partially resolved conflicts and custom edited results. Archive, registry, and audio workspaces fill the available window width.

## Verification and remaining scope

Validation passed: 78 unit tests, 12 native Electron workflow suites, and eight browser suites. Both packaged Mac variants passed launch and comparison-worker smoke tests on the development Apple Silicon Mac; the Intel build ran through compatibility execution.

The archive unit tests exercise stored/deflated data, traversal, duplicates, symlinks, encryption, ZIP64, CRC corruption, decompression bounds, and timestamps. Browser and native Electron workflows cover selection, expansion, child comparisons, reports, and saved state. These tests do not establish Windows runtime verification; Windows packages still require native Windows execution.

This milestone does not claim complete feature parity. Remote connections, archive modification/extraction, live registry operations, safe directory renaming, arbitrary file-pair alignment, comparison rules, and other entries in `implementation-plan.json` remain open.
