# Release 2.127.0 — Folder timestamp exceptions

Optional one-hour and whole-hour timestamp equivalence for Modified Time and Size + Modified Time comparison methods. Both are off by default. The existing tolerance applies around the allowed differences, while size checks continue to apply in Size + Modified Time mode.

The rules classify comparisons without changing file timestamps or the displayed dates. Original dates still determine newer-side ordering and synchronization direction. Content comparison methods remain independent of these timestamp-only options. Session files, reusable defaults and reports retain the rules.

Validation:

- 1,027 unit tests pass, with one Windows-only skip.
- Shared arithmetic checks positive/negative shifts, nanosecond precision, exact tolerance boundaries, whole-hour versus fractional offsets, strict flags and persisted schemas.
- Native filesystem tests cover node/selected/refresh/filename/snapshot classification and unchanged timestamps, including content-mode independence.
- Source native UI test passes exact/tolerance outcomes, size and content methods, closed-node exclusion, context/native focus, session/tab/swap/default/report retention and unchanged file bytes/timestamps.
- A held native scan verifies both rapid checkbox selections survive.
- The native test found an initial focus failure in content mode: the selector was still disabled during menu dispatch. Focus is deferred until dispatch finishes and guarded against switching sessions or closing the dialog.
- Light and dark options screenshots inspected; new controls and notes fit and remain legible.
- Both final Mac packages pass the full native workflow, including deferred native focus and held-scan rapid choices.
- Existing folder-rule and live-color regressions pass.
- All three ZIPs pass integrity checks; packaged versions, shared timestamp helper, changed native files and final renderer assets match source. Download sizes, SHA-256 checksums and browser Windows download pass. Shipped branding check is clear.

Actual Windows execution and broader full-product scope remain open.
