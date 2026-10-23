# Further Compare 2.34.0

**Show minor** highlights lines that differ only under the active case or whitespace rules. Amber marks distinguish them from substantive changes. With this enabled, Diff and Context include minor rows and Same excludes them. Merge sections and previous/next section navigation still use substantive changes, preserving ignored target text. Reports list minor text and line numbers separately.

Whitespace comparison now offers the existing **All whitespace** behavior or **Spaces / tabs**. The narrower scope preserves nonbreaking spaces and other characters. Both scope and minor-display preferences persist in tabs and saved sessions; older sessions retain their prior defaults.

Opening a child text comparison from a folder inherits the folder's case and spacing rules and enables minor inspection. Child setting changes remain independent. Folder Context filtering survives returning from a child, and Back waits for a background disk check instead of dropping the click. The renderer now exposes its active-operation busy state.

Development validation: 338 unit tests passed. Browser checks cover minor coloring, filters, report details, tab settings and responsive appearance. Native workflows cover scope persistence, legacy sessions, merge/undo preservation of UTF-16LE/BOM/CRLF, inherited folder rules, significant nonbreaking spaces, independent child changes, Context restoration and queued Back during a deliberately held disk check. Selected-pair and busy-context regressions passed.

Both final Mac packages passed child-rule and minor/case workflows, including the queued return, saved scope and original target text/encoding preservation (Intel under Rosetta). All three archives passed ZIP integrity, bundled version and 44 source-file checks. Download links, sizes, SHA-256 and the Windows ZIP browser download passed. Windows runtime verification requires a Windows host. Custom grammar/importance rules and the other remaining full-product capabilities stay tracked in `implementation-plan.json`.
