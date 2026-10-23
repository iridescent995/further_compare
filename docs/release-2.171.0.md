# Version 2.171.0

Table Compare adds **Save workbook copy**. Choose an XLSX side as the result, edit literal cell values, then save a copy retaining the original workbook's other sheets, styles, typed unedited cells and untouched formulas. No-edit copies retain exact original bytes. Values-only CSV and single-sheet XLSX exports remain separate actions.

The result retains its source workbook and sheet through Undo/Redo, tab switches, saved sessions and side swaps. A source hash prevents a result from being applied to a replacement input. Async export rejects a changed or pending replacement comparison. XLSX archive writeback uses the same preserving exporter and identifies the template side and sheet in review.

Edited workbook XML requests recalculation; this app does not calculate formulas. Inserted/deleted rows and columns require values export or undoing those structural edits. Shared/array formula members, metadata-bound cells, subordinate merged cells and digitally signed workbook edits are rejected rather than silently altered. Selective difference copying and typed/formula editing remain further work.

Verification passed: source engine/browser/native preservation tests, existing table regressions, and 1,715 unit tests (one skip). Packaged Apple Silicon and Intel Mac builds passed workbook-save and archive-writeback workflows. All three packages passed source/static checks, ZIP integrity and download verification. Windows runtime testing remains deferred at the user's request.
