# Array formula structural editing

Shipped and installed in 2.196.0. Both Mac architectures passed actual packaged workflows; Windows archive verified without runtime testing.

Legacy XLSX array formulas remain grouped during row and column structural edits. Insertion before a group moves its entire range and updates formula references. Deletion entirely before a group shifts it; deletion covering the entire row or column extent removes the group. An insertion through the middle or a deletion affecting only part of the group is refused before publishing an edit or undo entry.

The anchor formula and its range move together. Cached results for every group member are removed so stale numbers, errors or text are not shown as recalculated values. Styles survive. Formulas on other sheets update using the existing workbook reference rules. The editor treats cleared follower results as part of the structural change, not as scalar replacement edits. Individual array-member edits remain protected after moving the group.

Groups must have a top-left anchor, a bounded coherent range, and no overlapping groups, merged regions, table regions, foreign formulas or unsupported metadata. Metadata-backed dynamic spills and data-table formulas remain separate unfinished work. This increment does not evaluate array formulas; the workbook requests recalculation by its spreadsheet application.

Evidence:

- `test/workbook-structural-array-formulas.cjs`: helper and real XLSX package transformations, independently reloaded with ExcelJS; see `/private/tmp/fc-array-structural-final.log`.
- `test/workbook-array-structure-browser.cjs`: actual editor row/column moves, cache and style preservation, cross-sheet references, partial-edit and individual-member refusals, whole-group deletion, undo/redo, restored-session edits and unchanged input bytes; `/private/tmp/fc-array-editor-final.log`.
- Existing structural package/export/shared-formula regressions passed. Full unit suite: 2,173 passed, one skipped, zero failed; `/private/tmp/fc-array-full-units.log`.

The actual native workflow passed: `test/workbook-array-structure-desktop.cjs`, `/private/tmp/fc-array-desktop.log`. Both final Mac packages passed native array acceptance: `/private/tmp/fc-2.196-array-arm64.log` and `/private/tmp/fc-2.196-array-x64.log`. Signatures, packaged bytes, ZIP integrity, downloads and installed startup were verified. Windows runtime remains deferred.

Independent review also prompted adjacent-cell acceptance: a number edit beside a moved array survives export, session restoration and another move without creating array-member overlays (`/private/tmp/fc-array-editor-adjacent.log`). The ordinary structural regression test now waits for asynchronous typed-edit completion before inserting a row; the application’s stale-state safeguard remains unchanged.
