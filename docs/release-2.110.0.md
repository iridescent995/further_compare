# Release 2.110.0 — table results back into archives

Table comparisons opened from archive entries now offer reviewed application of the edited result to either original CSV, TSV or XLSX entry. CSV and TSV output uses UTF-8 with format-appropriate quoting. XLSX output is a new single-sheet, values-only workbook; the review explains that other sheets, formulas and formatting are not retained.

Changes stay in the parent archive's memory until Save ZIP. Parent archive undo/redo remains available. Runtime links reject replaced inputs, stale or closed parents, and missing sides; saved child sessions do not retain archive authority.

The broader product scope and Windows runtime validation remain open.

Validation: 896 unit tests passed, one Windows-native test skipped. Source and both Mac packages passed parsed CSV/TSV/XLSX output, review cancellation, repeat edits, both targets, parent undo/redo, tab restoration, standalone export, saved-session isolation and stale/replaced/missing/closed parents. Isolated export checks covered quoting, nulls, finite literal values, size bounds and mutation/reset during asynchronous XLSX generation. Existing text and binary archive-apply regressions passed. Light/dark reviews were inspected. All three package versions/UI, ZIP integrity, download sizes/SHA-256/browser download and shipped-branding checks passed.
