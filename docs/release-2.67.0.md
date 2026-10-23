# Further Compare 2.67.0

Folder filename search is available from the toolbar, right-click Navigate submenu, native Search menu and existing Find keyboard commands in folder sessions. The dialog offers case matching, whole words, regular expressions, wraparound, upward search and left/right scope. Find selects one match, Next/Previous advance through matches, and Select all matches selects matching entries on the enabled sides.

Search uses names in the visible tree, including the current filters. Expand folders or use All files to include more entries. It does not change filters, open comparison tabs or read unopened subtrees. Options are retained per open tab. Cancel restores focus. Invalid patterns and no matches preserve selection. Regex matching runs in a worker with a one-second timeout, and delayed results are rejected after the folder view or selection changes.

All 491 unit tests passed, along with native filename-search, grouped context-menu and existing text-regex regressions. Tests cover menu and toolbar routing, side scope, whole words, next/previous/wrap, all-match selection, invalid/slow regex, hidden descendants, active filters, cancellation and stale results. The dialog layout was visually reviewed.

Full product parity remains incomplete, and Windows runtime verification remains pending.

Both final Mac packages passed the filename-search regression. Intel automation intermittently encountered background-comparison command rejection; the rerun passed. All three package versions and changed bundles match source, ZIP integrity checks passed, and download links, sizes and SHA-256 checksums were verified.
