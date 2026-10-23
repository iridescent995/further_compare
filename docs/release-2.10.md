# Further Compare 2.10

## Folder navigation

Folder path bars now accept absolute paths: press Enter to open a directory, or Escape to restore the current path. Each side has Back, Forward, Parent and Recent folders controls. Text comparison paths remain read-only.

Back/forward stacks belong to each side of each open session. Swapping sides swaps their stacks too. Recent folders are shared across sessions and persisted locally, with up to 40 entries. Reopening a saved session starts a new navigation stack at its saved roots. Back/forward stacks are not saved into session files.

Navigation is also available in the folder right-click menu and the native View → Folder Navigation menu. Native actions use the focused side. New roots clear stale selections and expanded paths, then compare the new root's immediate files using the existing node-scoped comparison logic. Delayed results from an earlier root cannot recolor the current tree.

Missing directories and destinations that overlap the other root or backup directory are rejected without replacing the current roots or advancing history. This keeps the existing filesystem operation protections intact. The folder toolbar now wraps at narrower window widths instead of squeezing its help text into a tall column.

## Scope

This release adds folder navigation to the shared desktop implementation. Full-product work remains open in `implementation-plan.json`, including comparison rules, manual alignment, remote connections, archive editing and three-way folder merge. Windows runtime verification still requires a Windows host.

## Validation

All 99 unit tests passed. Desktop integration verified typed paths, parent/back/forward navigation, picker and recent history, invalid destination preservation, native menus, right-click actions, swapped stacks and isolated tabs. Both final Mac packages passed that suite on the development Apple Silicon Mac (Intel via Rosetta). Folder layout, directory rename, browser workspace and display-preference regressions also passed.

The 1024px folder layout was visually inspected. All three packages match the final source and version; ZIP integrity, download sizes and SHA-256 checks passed. These are unsigned preview builds. The Windows package was built and inspected, but has not been executed on Windows.
