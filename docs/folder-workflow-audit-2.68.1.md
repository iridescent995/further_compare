# Folder workflow acceptance audit — 2.68.1

Date: 21 October 2026. These checks used the current source-built Electron app on macOS. They verify the requested folder interactions, not full product parity or Windows runtime support.

| Requirement | Direct evidence | Result |
| --- | --- | --- |
| Compact rows, only name/size/last modified | folder-selection-desktop asserts 23px row height, three columns and exact headers | Passed |
| Colors reflect comparison results | folder-live-colors-desktop verifies DOM updates, provenance, focus/scroll retention and resolving status filters; folder-parent-status-desktop covers both themes and ancestor colors | Passed |
| Opening a tree node compares that node's files | folder-node-refresh-desktop observes node-specific IPC and no unrelated reads; folder-compare-queue-desktop checks settled siblings, collapsed nodes and concurrent expansion | Passed |
| Single-click selects | folder-selection-desktop verifies selection without opening another tab | Passed |
| Right-click options | folder-context-menu-desktop verifies grouped implemented inventory and keyboard/placement behavior. Audit found parent-comparison navigation missing; it is now in Navigate, with folder-pair-desktop verifying actual return, roots and selected pairs | Current implemented folder actions covered; full reference menu parity remains incomplete |
| Ctrl/Command selection without checkboxes | folder-selection-desktop verifies no row checkboxes, modifier toggles, ranges and focus-only navigation | Passed on Mac; Windows pending |
| Double-click opens comparison | folder-selection-desktop and folder-tree-ui-desktop verify actual file contents and preserved parent tab | Passed |
| Tree stays inline | folder-tree-ui-desktop and node refresh verify in-place branches and no extra tab when expanding/comparing nodes | Passed |

The current reference-menu audit is docs/reference-folder-menu-audit-2026-10-21.md. The previously locked Mac has since been unlocked and native menus inspected. Menu inventories alone do not prove behavioral equivalence. Full comparison-product features and Windows runtime verification remain open.
