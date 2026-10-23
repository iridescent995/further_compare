# Further Compare 2.77.0

Expanding a folder now follows a chain when each opened node contains exactly one child folder and no files. For example, expanding java reveals java/oracle/fsgbu/tfpm/orchestrator and the files inside orchestrator. The same behavior applies through disclosure arrows, right-click Expand folder, native Expand Selected Folder and keyboard navigation. Rows remain inline, with the original selection and no extra comparison tab.

The decision uses unfiltered immediate children from both sides. Files, multiple folders, type/alignment conflicts and skipped entries stop automatic descent. One-sided directory chains work too. Unrelated closed siblings remain unread. Automatic descent stops after 256 child nodes so exceptionally deep chains can be continued explicitly. Collapse retains the existing descendant expansion state.

Source regressions passed the paired example, one-sided chains, collapse/re-expand, keyboard/context/disclosure routes, excluded files and excluded second folders as stop conditions, and unchanged unrelated nodes. Existing node refresh, alignment/conflict recovery and expansion/cancellation regressions passed. Final package verification is recorded in implementation-plan.json.

This release also includes 2.76.1 clipboard filename and relative-path options. Full product parity and Windows runtime verification remain incomplete.
