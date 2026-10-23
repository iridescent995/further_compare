# Workbook-wide sheet review

Status: packaged, verified on both Mac architectures and installed in 2.219.0. Full regression passed (2,609 passed, one skipped); compact-panel browser acceptance, package audits, downloads and installed startup passed. This is a read-only review/navigation milestone; it does not implement workbook sheet creation, deletion, renaming, reordering or visibility changes.

Implementation uses exact-name inventory plus existing independent detail selectors, without persisting manual inventory pairings. It reviews original sources separately from result edits. Runtime source references, generation tokens and criteria bind derived statuses; sessions recompute them. The worker enforces aggregate limits and is terminated on cancellation. Independent XLSX/XLS/ODS fixtures and a genuine XLSB fixture qualify supported metadata and content. Missing XLSX formula caches report unavailable; legitimate cached error values remain comparable.

Validation logs: `/private/tmp/fc-workbook-sheet-review-browser-final.log`, `/private/tmp/fc-workbook-sheet-review-desktop-final.log`, `/private/tmp/fc-workbook-sheet-review-engine-independent.log`, `/private/tmp/fc-sheet-metadata-ods-fixed.log`. Installed release is 2.219.0; 2.218.0 is retained for rollback. Both Mac packages also passed ODS preserving-export/session/archive regressions. Windows package was statically checked; Windows runtime remains deferred. The design below records scope and qualification requirements, including broader possibilities not shipped by this milestone.

## Outcome

Show a compact workbook sheet inventory with exact-name matches, left-only/right-only sheets, order changes, visibility differences and per-sheet comparison status. Selecting a matched entry opens that sheet pair in the existing comparison. A workbook must not appear fully reviewed merely because its currently selected sheets match.

Current entry points: `src/advanced.js` projects XLSX worksheets into comparison data, creates independent sheet selectors in `table()`, and calls `compareWorkbookTables` for the selected pair. `src/legacy-workbook-reader.cjs` retains sheet visibility for XLS/XLSB. `src/ods-input.cjs` projects worksheet names and content but does not currently provide qualified visibility metadata. Reuse these source readers and existing comparison engines rather than creating a second workbook decoder.

## Metadata qualification across formats

Introduce a normalized sheet descriptor with source-bound identity, name, original ordinal, comparison capabilities and explicit visibility availability. A proposed visibility shape is `{available:true,value:'visible'|'hidden'|'veryHidden'}` or `{available:false,reason}`. Missing metadata must never be silently interpreted as visible.

- **XLSX:** read sheet names, order and `state` from the validated, relationship-resolved original workbook XML. Confirm worksheet relationships and parser projections agree. Qualify absent `state` as visible only against the format specification. Retain hidden and veryHidden distinctly. Chartsheets or other nonworksheet entries must be listed with unsupported-content status or explicitly disclosed; do not silently erase them from the workbook inventory. Duplicate names, ambiguous IDs/relationships and parser omission require explicit failure or unavailable inventory.
- **XLS:** inspect the existing authoritative BIFF sheet census and visibility validation, then retain its source order/name/type alongside the legacy reader projection. Confirm records for nonworksheet sheet kinds are rejected or surfaced explicitly. Do not infer completeness from a third-party parsed sheet array if preflight skipped a record.
- **XLSB:** use the validated workbook sheet-bundle record census and its state/type fields, preserving the same agreement checks with parsed sheets. Qualify actual independently sourced XLSB fixtures; derived record mutations can supplement but cannot substitute for successful producer readback.
- **ODS:** qualify visibility from original table styles, including automatic/common styles, parent-style inheritance and default table style as applicable. Resolve namespace-qualified `table:style-name` to the relevant style family and `table:display` property under the ODF specification. Bound inheritance traversal and reject cycles/duplicate ambiguous definitions. Names and source order come from admitted spreadsheet table elements. Determine explicitly which extension states lack a portable equivalent; do not invent an ODS veryHidden state. If a valid package's visibility cannot be qualified, retain the sheet inventory with unavailable visibility while still comparing supported contents. ODS is an intended source in this milestone, not automatically deferred.

Consult primary OOXML, MS-XLS/MS-XLSB and ODF specifications during implementation. Record exact default/inheritance rules and verify them with an independent reader. The proposal itself is not evidence that every metadata profile is supported.

## Pairing and identity

Default pairing is exact sheet name, case-sensitive and Unicode-preserving. Do not guess renames from similar contents. Names present on only one side remain left-only/right-only. A differently named manual pairing can be offered as an explicit user action, with unmatched entries still visible and each sheet used at most once.

Persist only user-approved pairings and review preferences, bound to both original workbook content hashes and original sheet identities/names. Missing pairing state means exact-name pairing. Reject duplicate endpoints, nonexistent sheets and stale bindings; never reattach a stored index to a new sheet after source replacement. A side swap reverses validated pairing endpoints. Manual pairings must be visibly distinguishable from exact-name matches.

Order differences should compare each matched sheet's relative order among matched sheets, with source ordinals also displayed. Simply comparing raw indexes can misleadingly flag every later sheet after one insertion. Define the rule explicitly in tests. Visibility remains a separate metadata result, not a cell-value difference.

## Status calculation

Use an explicit state machine per pair: not compared, queued, comparing, same for selected criteria, different, unavailable, cancelled or error. Added/removed sheets have their own structural statuses. Do not collapse unavailable, cancelled or error into same. A workbook summary may claim all compared criteria match only when every relevant matched sheet completed and no structural/metadata difference or unavailable selected criterion remains.

Compute with the same options as the detailed sheet view: values versus formulas, header handling, delimiter where applicable, key columns, formatting, layout, conditional rules and number formats. Refactor common comparison preparation into reusable pure functions instead of duplicating `table()` logic. Formula dialect incompatibility and missing caches must retain existing unavailable semantics. Duplicate keys must produce the same error/unavailable outcome as the detailed view. Cross-sheet summaries must not reinterpret physical-address metadata using keyed row alignment.

Start with workbook/workbook comparisons. A CSV/TXT input is not a multi-sheet workbook; retain its existing comparison flow or present it clearly as a single input without claiming stored worksheet metadata. Large sheet lists should be virtualized or paginated. Render one inventory row per sheet/pair and navigate to existing detail; do not materialize all detailed DOM tables.

## Work budgets and cancellation

Keep existing container, cell, text and parser budgets. Add aggregate comparison budgets across all sheet pairs, not merely a per-sheet allowance. Proposed starting bounds are the admitted workbook's existing total-cell ceiling, at most 1,000 inventory entries, a bounded cumulative compared-cell/text budget and a limited number of simultaneously active jobs, initially one. Measure exact limits against independent fixtures before freezing them.

Schedule work in a terminable worker or cooperative bounded chunks; avoid a synchronous loop that freezes editing and scroll. Support Stop and prioritizing the selected sheet. Report completed counts and pending states, never an unsupported precise completion ETA. After cancellation, retain only results whose source/options binding remains current and mark remaining entries cancelled/not compared.

Cache completed results by both workbook hashes, sheet identities, pairing revision, relevant option signature and edit-overlay revision. Invalidate immediately on source replacement, changed options, pairing changes or affected edits. Bind asynchronous responses to a generation token; late results must not publish after cancellation, tab switch, source reload or side swap. Bounds/errors must leave source data and detailed editor drafts intact.

## Navigation and edit preservation

Inventory navigation changes only the active comparison pair. It must not implicitly change the result-template sheet, clear typed overlays, reset the result draft, discard structural/style edits or grant archive writeback authority. Existing source-bound XLSX/ODS result-template identities remain independent of which source sheets are being inspected.

Before enabling navigation, audit `state.options.sheeta/sheetb`, result initialization and sheet-selection handlers for hidden destructive resets. If a transition genuinely requires replacing an unsaved result, use the existing explicit discard/save guard; do not introduce blanket prompts for harmless navigation. Preserve undo/redo history and result-template settings on ordinary sheet review.

State restoration must validate pairing bindings before selecting sheets, then reconstruct statuses from current inputs. Do not persist completed status labels as authoritative evidence; recompute or validate a derived cache. Session/default settings may retain the review preference, but reusable defaults must not contain document hashes or sheet-specific pairings. Archive child comparisons continue using their existing live source links and review/Undo rules; sheet navigation must not fabricate replacement authority after session restore.

## Independent qualification

Create source fixtures using openpyxl plus LibreOffice for XLSX/XLS/ODS, with genuine independently produced XLSB fixtures where available. Read back the original fixtures with LibreOffice UNO or another independent supported reader and record names, order, visibility, types and representative cell values. Inspect raw format records/XML separately so producer normalization does not hide expected distinctions.

Fixture matrix:

- Same workbooks, added/removed sheets, exact-name matches in different order, and differently named sheets with identical data that must not auto-pair.
- Hidden/veryHidden states where supported, ODS inherited/default visibility, and a valid but unqualified visibility profile reported unavailable.
- Empty sheets, styled blank cells, non-ASCII names, unsupported nonworksheet sheet kinds and metadata/parser census disagreement.
- A difference only on a nonselected or hidden sheet; values equal but formula/number-format/conditional/layout criteria differ.
- Missing formula caches, incompatible formula dialects, duplicate keys and invalid key indexes with outcomes matching the detailed view.
- Source replacement, side swap, manual pairings, cancellation and changed options while background comparison is pending.
- Existing typed/structural/style edits survive navigating several source pairs, undo/redo and session restoration; result export opens correctly in the independent spreadsheet application.
- Exact original-byte hashes remain unchanged; separate XLSX/ODS exports and archive-child writeback preserve their existing authority constraints.

Run real browser and Mac app workflows, then qualify both packaged Mac architectures. Windows runtime remains deferred by the user; static package checks remain necessary. Do not claim full workbook parity, calculation support or sheet editing from completion of this read-only review milestone.
