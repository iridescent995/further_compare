# Further Compare 2.64.0

Two-way folder sessions now offer Left only and Right only display filters in the toolbar, right-click View submenu and native View > Folder Display menu. Each view shows entries present only on that side, keeps their paired placeholder rows aligned, and prunes hidden selections.

Paired folders remain available in the lazy tree so users can expand them to find one-sided descendants without scanning unrelated branches. Loaded-files views retain the existing file-only semantics. Filename masks still apply. All restores the normal view.

The filter is persisted with folder compare, merge and sync sessions. Text and other session types reject these folder-specific saved values, and native filter commands do not change a child text session’s display mode. The controls are hidden in text/browser workspaces.

Source tests cover toolbar/context/native routes, unopened subtree expansion, left/right switching, selection pruning, child comparison isolation, parent restoration and saved-session reopening. Unit tests cover schema restrictions, lazy directories, masks and file filtering. Existing grouped-menu, parent-color and browser appearance checks passed. The new regression is included in desktop CI.

All 484 unit tests passed. Both Mac packages passed the new regression. All three package versions and changed bundles match source; ZIP integrity and download verification passed. Windows runtime remains unverified.
