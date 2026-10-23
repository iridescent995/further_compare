# Further Compare 2.66.0

Folder display filters now include paired entries, changed pairs, either-side-only entries, newer files on either side, and newer files combined with same-side-only entries. They are available from a compact More filters selector, the right-click View submenu, and native View > Folder Display.

Pairing and content status are separate from timestamp criteria. Changed pairs exclude one-sided entries but include file/folder conflicts. Newer criteria require finite modified times for paired files, exclude ties, and use the actual timestamp ordering; an identical file may still be newer. Combined criteria also include one-sided entries. Paired folders stay navigable in the lazy tree. Filters only use loaded metadata and comparison results and do not read unopened subtrees.

Filter definitions are shared by the view, native menu and session validator. Advanced filter selections persist in two-way folder sessions and are rejected for other saved session types. All clears the compact selector; switching menus updates its displayed value. Existing name masks and selection pruning apply.

Source tests cover every criterion, invalid timestamps, native/context/toolbar routes, session reopening and unchanged files. Existing one-sided, grouped-menu and browser appearance regressions pass. All 486 unit tests passed. The new native regression is included in desktop CI.

Both packaged Mac architectures passed the expanded filter regression. The compact selector screenshot was visually reviewed. All three package versions and changed bundles match source; ZIP integrity and download verification passed. Windows runtime remains unverified.
