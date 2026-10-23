# Further Compare 2.12

## Folder comparison methods

The Compare control supports content (the default), size, modified time, and size plus modified time. Content mode uses SHA-256 and the existing revision checks. Metadata modes compare the selected attributes without reading file contents, while still checking that files were not changed or replaced during the comparison.

Time comparisons accept a symmetric tolerance from zero to 86,400 seconds, in millisecond increments. A difference exactly equal to the tolerance matches. Size plus modified time requires both conditions to match; content and size modes ignore the time tolerance.

Metadata matches have a distinct tint, a Metadata match legend, row provenance and a persistent notice that content was not verified. The summary says metadata matches rather than identical files. Folder JSON exports include comparison rules and per-file provenance. One-sided entries and file/folder conflicts remain separately classified.

Rules apply to immediate tree nodes and the recursive All files view. Changing a rule discards previous results and rescans; delayed results from previous rules cannot replace current colors. Settings remain isolated by tab and persist in saved sessions. The native View menu and right-click menu expose the same comparison methods. The desktop bridge now also admits the recursive view menu action.

Copy, delete, merge and sync previews still use their existing content-based validation. Choosing a faster display comparison never weakens operation validation. Advanced content rules, text importance classification and other full-product capabilities remain open in `implementation-plan.json`.

## Validation

All 109 unit tests passed. Both final Mac packages passed the comparison-rules integration suite (Apple Silicon natively, Intel via Rosetta), including equal metadata with different contents, tolerance boundaries and fractional seconds, actual native/context commands, recursive rescans, saved sessions and tab isolation. Recursive, folder navigation and browser regressions passed; the metadata view was visually inspected.

All three packages match the final source and version. ZIP integrity, download links, sizes and SHA-256 checks passed. These are unsigned preview builds. The Windows package was built and inspected but not executed on Windows.
