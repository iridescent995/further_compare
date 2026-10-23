# Further Compare 2.13

## Folder reports and statistics

The Report button, folder right-click menu, native View menu, and existing File export action now open a report dialog for folder sessions. It captures a fixed snapshot so that background refreshes and later filter edits cannot change an open report unexpectedly. Reopen the dialog to capture newer results.

Choose visible rows (the current filters and layout) or all loaded entries. The preview shows up to 100 rows; exports include every row in the selected scope. Statistics separate file rows, directory rows, content matches, metadata matches, differences, one-sided files, conflicts and pending results, plus per-side file counts and known byte totals. Unknown sizes remain separate from zero-byte files. A type-conflict row may contribute both a file and a directory, so those categories need not sum to the row count.

HTML, CSV, text and JSON exports include roots, UTC capture and modification times, comparison rules, tolerance, filters and scan coverage. HTML is standalone and print-friendly, with escaped paths and no executable scripts. CSV quotes fields and neutralizes text that could otherwise become spreadsheet formulas. Numeric byte counts remain numeric.

Coverage explicitly distinguishes complete recursive scans, partial/stopped scans, scans in progress, and loaded tree nodes. Complete traversal does not imply a filtered report contains every file. Skipped files and directories remain counted. Unverified rows never become verified matches merely because a report was exported, and metadata matches are identified as unverified contents.

Full-product work remains open in `implementation-plan.json`, including advanced content rules, manual alignment, remote sources and three-way folder merge.

## Validation

All 114 unit tests passed. Both final Mac packages passed the report integration suite (Apple Silicon natively, Intel via Rosetta), including loaded/recursive coverage, filtered scopes, frozen snapshots, metadata distinctions, all export formats, escaped filenames, native/context access and stopped scans that stay partial after late reads. Recursive, expansion and comparison-rules regressions also passed.

The dialog and standalone HTML export were visually inspected. All three packages match the final source and version. ZIP integrity, download links, sizes and SHA-256 checks passed. Packages are unsigned previews; Windows was built and inspected but not executed on Windows.
