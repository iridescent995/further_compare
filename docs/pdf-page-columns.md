# PDF Page columns reading mode

Status: packaged, verified and installed in 2.209.0. Release 2.208.0 is retained for rollback.

Page columns is an explicit geometric reading policy for horizontal left-to-right PDF text. It reads a column from top to bottom before moving to the next column. Spanning rows split the page into bands, so headings and footers can remain between column sections. It does not infer semantic reading order or distinguish tables from prose. Document order remains the default; Page rows remains available for row-oriented material.

The policy is `page-columns` for CLI and batch inputs. It is available per side in Text options and three-way Text Merge. Changing an input preference does not relabel an existing extraction. Re-extraction requires an original source and successful extraction before replacing the text; cancellation or failure keeps the previous draft. Original PDF bytes and source-path protections remain authoritative.

Saved PDF projection version 3 identifies `order: page-columns` and `orderVersion: 1` with an exact exclusion list. Legacy document-order version 1 and page-row version 2 retain their meanings. Native IPC and the isolated Node framing protocol validate the new enum explicitly; unknown policies and frame codes remain rejected.

Independent ReportLab fixtures cover identical geometry with different PDF drawing order, genuine changed words, full-width headings/footers and multiple column sections. Source acceptance: 2,452 tests passed, one skipped. Independent browser workflows passed ordinary comparison, per-side settings, cancelled/failed re-extraction, strict v3 sessions and three-way merge restoration. Native checks passed service IPC, reload, session reopening, unsupported-input atomicity and original-file/hardlink protection. Final app and native PDF service source maps match the current ordering implementation. Both Mac packages passed PDF columns, three-way PDF merge and shell-helper workflows. All three package/ZIP audits and download checks passed. Installed PDF assets, startup and Finder Services passed. Windows runtime remains deferred.

The gutter detector uses bounded geometric extent sweeps and at least two row supports on each side of a wide gap. It supports staggered baselines and recursive multi-column bands. Whitespace-only items that span a selected gutter become line separators; nonblank strings and intra-column spaces remain intact. Limits and cancellation remain enforced, including a 130,000-row regression without spread/stack overflow.
