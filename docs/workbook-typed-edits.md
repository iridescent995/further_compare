# Typed workbook edits and formula copying

Status: shipped and installed in 2.189.0. Browser, native and both Mac packages verified; Windows package verified, with runtime testing deferred.

Choose an XLSX input as the result to preserve its workbook. Select comparison cells or rows and use **Copy left cells to result** or **Copy right cells to result**. Ordinary formulas, numbers, booleans, blanks and text retain their types, including when the displayed cached values are equal. Key-based alignment translates relative formula references to the result row; absolute references, strings, sheet names and structured references retain their meaning.

The result's cell controls explicitly select Text, Number, Boolean, Blank or Formula. Direct typing in the grid always creates text, including text beginning with `=`. Undo/redo and saved sessions retain typed edits and their source workbook binding.

**Save workbook copy** writes edits into the selected workbook package. It retains destination cell formatting and untouched ZIP part contents. New or changed formulas have no cached result; the workbook requests recalculation when opened in a spreadsheet application. Further Compare does not calculate formulas.

Values-only exports cannot silently present stale formula caches as newly calculated results. **Use values only** explicitly converts the result after confirmation and clears formula results that need recalculation. Undo restores the workbook result and its edit metadata.

Current limits:

- Shared, array, data-table and metadata-dependent formula groups cannot be selectively copied or edited as independent cells.
- Structural row/column edits do not preserve the original workbook. New typed/formula edits require explicit conversion before structural edits.
- Base-cell formatting copying shipped in 2.190; see [formatting copy](workbook-formatting-copy.md). Reference-preserving structural editing remains in progress.
- Date, error and rich-text cells are not automatically copied as ordinary typed values. Explicit cell editing remains available where the cell is not part of a protected group.

Validation includes lexical formula translation, strict session bindings, preserving export/cache removal, browser workflows, native session restoration, archive-child writeback and independent archive undo. Regression checks cover existing literal workbook edits and selective table copying.

The full unit suite passed with 2,002 tests and one skip. Both packaged Mac workflows also passed a delayed-save-reply check: archive undo waits until saving has finished. The prior 2.188 app remains backed up.
