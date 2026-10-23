# Folder UX audit — 2.164.0

This audit checks the original seven folder UX requirements against the current packaged product. It does not certify full product parity or Windows runtime behavior.

| Requirement | Evidence | Scope |
| --- | --- | --- |
| Compact folder comparison | folder-selection-desktop asserts actual 23px row geometry | Packaged UI |
| Colors; only size and modified metadata | folder-selection-desktop asserts exactly Name, Size, Last modified; folder-live-colors-desktop checks asynchronous equal/changed status, content provenance and preserved DOM/focus/scroll; rendered light menu reviewed | Packaged UI |
| Compare files in expanded node only | folder-tree.test paired expansion checks unopened descendants stay out of hash cache until their node is compared; folder-live-colors-desktop checks resolved colors | 35 tree unit cases plus packaged UI |
| Click selects | folder-selection-desktop and folder-tree-ui-desktop verify selected state with unchanged tab count | Packaged UI |
| Right-click actions | folder-context-menu-desktop enumerates file operations, selection, tree, filters, comparison, navigation, reports, session and tool submenus; checks keyboard access, focus and edge placement in both themes | Existing local action inventory; not all future remote operations |
| Modifier multi-selection; no checkbox | folder-selection-desktop checks zero row checkboxes, platform modifier toggles, ranges and context selection preservation | Packaged UI |
| Double-click opens comparison | folder-selection-desktop and folder-tree-ui-desktop verify double-click child session with actual contents and parent return | Packaged UI |

The tree UI regression used an obsolete direct click on Clear alignment after that action moved into Filters & options. Updated it to use the same dialog helper as the other folder options, retaining all assertions. No product behavior was changed for this audit.

Remaining scope includes actual Windows runtime verification and broader requested product features, including unfinished remote file-management actions. The overall goal remains active.

All four packaged suites passed on both Apple Silicon and Intel. Evidence: `/private/tmp/fc-2.164-{mac-arm64,mac}-{folder-selection,folder-live-colors,folder-tree-ui,folder-context-menu}.log`. The 35 tree unit tests passed: `/private/tmp/fc-2.164-folder-tree-unit.log`.
