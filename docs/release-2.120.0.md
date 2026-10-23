# Release 2.120.0 — Separate folder text encodings

Folder text comparison now supports a shared encoding with optional left and right overrides. Open Text encoding from Filters & options, the context menu or the native menu. Each side can inherit the shared choice or explicitly use Auto. Existing saved sessions retain their shared behavior. Overrides persist in sessions and defaults, follow the roots when swapped, and carry into child text editors, selected-pair comparisons and reports.

Normalized comparison caches and operation snapshots use each side's effective encoding. Identical bytes interpreted as different text correctly differ under text rules; exact content mode remains byte-based. Invalid or binary text retains the existing byte fallback. Node comparison remains scoped to immediate entries; unopened descendants remain unread.

Validation: 945 unit tests pass with one Windows-only skip. The new source desktop workflow and both Apple Silicon and Intel packages pass mixed CP1251/UTF-8 normalization, identical-byte decoding differences, cancellation, source swapping, cache/color invalidation, invalid-byte fallback, scoped node and selected refresh, child editors, selected pairs, reports, saved-session restoration and tab isolation. IPC assertions verify the exact encoding pair passed to native reads. Existing shared encoding and strict-child source regressions pass. Both light and dark dialog screenshots were visually inspected.

All three release archives pass ZIP integrity, version and renderer/CSS checks. Changed native modules match the source in each package. Download sizes, SHA-256 hashes and the Windows browser download pass. Shipped source branding checks pass. Windows runtime and the remaining full-product scope remain open.
