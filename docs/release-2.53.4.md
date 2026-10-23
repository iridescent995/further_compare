# Further Compare 2.53.4

Folder context menus now offer explicit left/right size and modified-time sort commands from either pane. Reports offers both left and right folder snapshots; a missing root disables its snapshot command. These commands use the existing shared sort and snapshot implementations.

Validation: the new desktop regression passed in source and both packaged Mac architectures. Different size/timestamp ordering on each side proves that the selected sort key is used and paired rows stay aligned. Real snapshots saved from both pane menus prove the selected root supplies the contents. Selection/focus and missing-root disablement are covered. Existing grouped context-menu and folder-view regressions passed; the latter was updated for grouped menu labels and aggregate directory sizing. The new suite runs in cross-platform CI.

All three package versions and UI bundles matched the current build, and all three ZIP integrity checks passed. Windows runtime verification remains pending.
