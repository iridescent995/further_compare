# Folder interaction audit — 2.124.0

The current source was checked against the requested compact folder workflow on 21 October 2026. The Mac was initially locked; after the user unlocked it, the reference Session Settings dialog was inspected visually. These results establish Further Compare behavior, not complete reference parity.

Native Electron regressions passed:

- `folder-selection-desktop.cjs`: 23px rows; only Name, Size and Last modified columns; no selection checkboxes; single-click selection without opening a tab; native Cmd/Ctrl multi-selection; contiguous and additive ranges; double-click opens one comparison; parent return preserves browsing.
- `folder-expand-desktop.cjs`: inline subtree/all expansion, isolated collapse, cancellation during delayed I/O, session cancellation, blank counterpart focus and selection criteria.
- `folder-context-menu-desktop.cjs`: implemented command inventory, compact grouped root, keyboard navigation, disabled items, focus restoration, hover/dismissal, multi-selection and light/dark viewport-edge placement.
- `folder-live-colors-desktop.cjs`: delayed native comparison updates status and accessible labels while preserving actual DOM rows, selection, focused element and scroll; status filters update membership correctly.
- `folder-columns-desktop.cjs`: paired resizing, expanded rows, preserved selection/sort, context/native reset and compact row height.
- `folder-chain-desktop.cjs`: automatic single-child expansion via keyboard, context and disclosure; paired/one-sided chains; files, branches and excluded raw entries stop chaining; closed siblings are not read and no extra tab opens.

- `folder-toggle-doubleclick-desktop.cjs`: new regression for collapsed/expanded folders, immediate/delayed second clicks after DOM replacement, exactly one scan/toggle, preserved selection/focus and no child tabs. Source and Apple Silicon initially passed. Intel revealed lost focus when a disclosure receives focus during a redraw; the deterministic reproduction failed before the fix and passes in source and both Mac packages after the 2.124.1 correction.

The audit identified a focus correction for release 2.124.1. Broader comparison types, remote providers, advanced rules and Windows runtime verification remain incomplete as tracked in `implementation-plan.json`.

## Reference settings inspection

Session > Session Settings > Comparison exposes quick size/timestamp checks, time tolerance, daylight-saving/timezone exceptions, filename case, extension and Unicode-normalization alignment, Unix permissions/owner/group checks, and content comparison choices. Handling exposes background subfolder scans, archive-as-folder handling, symlink following and automatic-refresh interval. The dialog was cancelled; no settings or file operations were applied. This is control-inventory evidence only, not verification of every option's behavior.

Current folder rules have content/normalized-text/size/time methods and time tolerance. Source inspection found no configurable Unix metadata comparison or same-tree extension/normalization alignment policy. Structure-independent filename matching already normalizes names, but that does not prove same-tree policy parity. These are explicit remaining gaps. Background recursion is not adopted as the default: the user's requested opened-node comparison remains authoritative.
