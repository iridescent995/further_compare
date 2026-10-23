# Further Compare 2.79.0

The folder report dialog now supports Selected rows (both panes). Open it directly through right-click Reports > Selected entries report or native View > Selected Entries Report. Paired rows selected on both sides appear once. Selecting a folder does not implicitly include its descendants.

Reports capture the current rows, comparison provenance, rules and metadata when the dialog opens. Switching among selected, visible and loaded scopes uses the same frozen snapshot. HTML, CSV, text and JSON export are available. Empty selection disables the selected-report context action and scope option; native invocation explains that entries must be selected. Closing the selected report returns focus to the tree.

This is a selected-results report, not a line-by-line file-content report. It does not read additional folders, compare files or create child comparison tabs. Detailed file-content reports remain a separate product gap.

All 15 report unit tests passed. Source selected-report and existing folder-report desktop regressions passed, including both-pane deduplication, descendant exclusion, snapshot isolation, escaped exports, menu entry points and no additional reads or tabs. Final package verification is recorded in implementation-plan.json. Windows runtime acceptance and full product parity remain incomplete.

Source grouped context-menu checks and both final Mac selected-report workflows passed. All three package versions and changed assets matched source; archive integrity, download links, sizes and SHA-256 were verified, including a Windows ZIP browser download.
