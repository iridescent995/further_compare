# Further Compare 2.14

## Manual text alignment

Use **Align lines** in text comparisons or merges to pair specific lines around repeated blocks. Click a line number on each side to prefill the dialog, or enter one-based line numbers directly. Add, remove or clear ordered pairs; crossing pairs, duplicates and lines outside the documents are rejected. Purple line-number markers identify anchored rows.

Up to 1,000 pairs guide the diff while retaining global hunk coordinates for merging. Paired lines can have different contents. Native View → Align Text Lines opens the same controls. The browser workspace also supports alignment.

Pairs persist in sessions and individual tabs and reverse coordinates when sides swap. Logical text changes clear pairs to avoid stale positions. Undo restores alignment after merges and recorded replacements; direct typing starts a new edit history. Encoding and line-ending-only changes preserve line coordinates. The open dialog refreshes when native Undo changes its pairs.

Full-product scope remains in progress, including content rules, binary alignment, remote sources and three-way folder merge. See `implementation-plan.json`.

## Validation

All 122 unit tests pass, including randomized bidirectional merge reconstruction with anchors, bounded large-document alignment and strict session validation. Desktop integration covers native menus, merges, undo, swap, tabs, saved sessions, line-number selection, edit invalidation and stale-dialog removal. Chrome verifies browser alignment, swap and edit invalidation; startup and existing text-history regressions pass. Both comparison and dialog visuals were inspected.

Both final Mac packages passed the alignment suite: Apple Silicon natively and Intel through Rosetta. All three packages match the release source and version. ZIP integrity and download link, size and SHA-256 checks passed. Packages are unsigned previews; Windows was built and inspected but was not executed on Windows.
