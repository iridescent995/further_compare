# Further Compare 2.67.1

Cancelling filename search now restores keyboard focus to the selected folder row even if an in-flight background comparison replaced that row's DOM while the dialog was open. Previously the dialog retained a detached element, leaving focus outside the tree. The fallback resolves the row again within the original tab and root context, or focuses its pane if the row is no longer visible. Existing toolbar focus restoration and stale-selection protection are preserved.

A deterministic native regression holds a background comparison, opens Find from a selected row, changes file metadata, releases the comparison and verifies that Cancel restores focus to the newly rendered selected row. This failed before the fix and passes afterward. The full filename-search regression also passes. The focus regression is included in the filename-search desktop CI command.

The intermittent Intel command rejection observed in 2.67.0 has not been conclusively diagnosed; this release fixes the separately reproduced focus bug. Full product parity and Windows runtime verification remain incomplete.

Both packaged Mac architectures passed the focus regression. Existing busy-command regression passed, including queued actions, double-click opening, inline expansion, and rejection after selection changes. All three package versions and UI bundles match source.
