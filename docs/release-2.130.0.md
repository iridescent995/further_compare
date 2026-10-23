# Release 2.130.0 — Filename spelling comparison

Added optional Compare filename spelling in folder Comparison rules. Paired files or folders can now show a name difference even when their contents match. Exact basename spelling includes case, Unicode representation and extension; different parent paths alone do not count. Pairing options remain separate and actual names are preserved.

The criterion works with lazy tree nodes, selected comparisons, manual alignment, filename-across-folders mode and unopened-descendant operation inventories. Reports retain both filename differences and the underlying file-comparison result. Sessions, tabs, side swaps and reusable defaults preserve the option. Windows supports this criterion independently of Unix metadata checks.

Validation: full unit suite passes 1,082 tests with one Windows-only skip. New tests exercise strict flags, platform guards, raw basename comparison, explicit snapshot endpoints, lazy directory/file classification, repeated refresh/opt-out, manual and flat pairs, and unopened operation eligibility. Source desktop and both final Mac packages passed the complete filename workflow, including reusable defaults, native/context options, lazy expansion, click selection/double-click opening, reports, session persistence, swaps and opt-out. Input names and bytes remained unchanged. Existing extension matching desktop regression passed. Light and dark options were visually inspected. All three ZIPs passed integrity checks; versions, changed modules and final renderer assets match source. Download sizes, SHA-256 and browser Windows download passed. Shipped branding search is clear.

Actual Windows runtime and remaining full-product scope remain open.
