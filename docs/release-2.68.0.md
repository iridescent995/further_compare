# Further Compare 2.68.0

Show hidden temporarily bypasses folder filename masks, the path query and status filters without changing their stored values. Restore filters reapplies them. The toggle is available from the folder toolbar, right-click View submenu and native View menu. Revealed rows have a teal dotted marker and an accessible explanation; normal comparison colors remain available on file icons and metadata.

The toggle is temporary and independent per open tab. It is not saved into session files. Revealed files support normal selection and double-click comparison. Restoring filters prunes hidden selections. Unopened descendants are not scanned by toggling. Parent summaries use the effective filename scope, and comparison reports describe the effective filters. Folder file-operation previews retain their existing explicit contents semantics; this change does not establish parity for filtered recursive copy/move/delete behavior.

The source regression covers toolbar/context/native routes, filename/query/status bypass, mask preservation, marked rows, lazy scope, selection/opening, pruning and tab isolation. Existing grouped-menu, parent-color and report regressions passed; all 491 unit tests passed.

Full product parity and Windows runtime verification remain incomplete.

Both final Mac packages passed the new regression. Light and dark screenshots were reviewed. All three package versions and changed bundles match source; ZIP integrity, download links, sizes and SHA-256 checks passed. App source and assets contain no reference-product branding.
