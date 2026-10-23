# Release 2.126.0 — Automatic folder refresh preferences

Folder comparisons now have a saved automatic-refresh interval: Off, 1.5 seconds (the existing default), 5 seconds, 15 seconds, 30 seconds, 1 minute or 5 minutes. Find it in Filters & options > Tree & display, right-click View > Automatic refresh, or the native View > Folder Comparison menu.

Refresh examines roots and opened nodes without traversing closed descendants. It starts no new scans while a dialog, guarded operation or expansion is active, or the document is hidden; an existing scan and its queued content comparisons may finish. A completed node listing starts a fresh interval, and active content comparisons also block the next scan. Slow disk reads therefore cannot produce overlapping scans. Recursive and filename views retain manual refresh. Text-file refresh is unchanged.

Saved comparisons, tab switching, side swapping, reusable defaults and folder reports retain the interval. Legacy sessions retain the previous 1.5-second behavior. Manual refresh works with automatic refresh disabled.

Validation:

- 1,022 unit tests pass; one Windows-only test is skipped.
- Deterministic scheduling tests cover deadlines, slow scans, pause, Off, context/interval changes, stale other-view completion and strict preference validation.
- Source desktop test verifies real external edits/deletions, opened-node scope and closed-node exclusion, dialog pause, disabled/manual refresh, native/context controls and persistence across sessions, tabs, swaps and defaults.

Both Mac packages pass the native workflow. The Intel run exposed a test assumption: queued content comparisons from an earlier listing can finish after a dialog opens. The test now waits for native calls to settle before checking that the dialog suppresses further refresh work. No new folder listing was started during the dialog.

All three ZIPs pass integrity checks. Packaged versions, native modules, shared refresh helper and final renderer assets match source. Download sizes, SHA-256 checksums and browser Windows download pass. The shipped branding search is clear. Windows execution and broader product parity remain unverified.
