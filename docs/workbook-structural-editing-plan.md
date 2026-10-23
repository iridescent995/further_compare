# Preserving workbook structure

Status: supported XLSX structural editing and coordinated table-header renaming are verified and installed in 2.191.0. This document records the full intended scope; broader reference owners remain unfinished.

## Ordered operations

Persist a source-bound journal with version, template side, sheet name, source hash, original grid dimensions and ordered operations. Each operation has `axis`, `operation`, `index` and `count`; indices are one-based in the state immediately before that operation. Validate dimensions at every step, then compare the original dimensions and hash to the actual parsed workbook during restoration/export.

Keep original coordinates separate from result coordinates. Typed/style overlay destinations move and deleted destinations disappear. Formatting-copy source coordinates continue to address immutable source bytes. Original formulas receive the entire operation sequence. A typed formula entered partway through editing receives only subsequent transformations; export must not transform it twice.

Inverse coordinate mapping distinguishes inserted cells from moved originals. Without it, comparing the edited grid to the original grid would overwrite moved formulas with displayed text. Undo must restore the result, journal, typed/style overlays and copy bindings as one transaction.

An empty grid retains explicit row/column dimensions; column insertion must not silently create a row. Ragged source rows require consistent column mapping. The XML engine must transform all stored cells, including formatted cells outside the displayed value grid.

## Package-wide transformation

Inventory relationships and reference-bearing parts before mutating a private package copy. Transform references with their owning sheet context. Publish only after validation; retain unchanged ZIP part bytes and original files.

Required surfaces:

- Cell addresses and row/column metadata, dimensions, spans, views, panes, selections and breaks.
- Formulas on every sheet, absolute/relative references, defined names, local names, print areas/titles, and eventual 3D reference handling.
- Shared/array/data-table/spill formulas and associated metadata.
- Merges, table ranges/columns, filters, sorting and structured references.
- Validation and conditional-format ranges/formulas, preserving their relative anchor semantics.
- Hyperlinks, comments/VML/threaded comments, drawing anchors, chart references and caches.
- Protected ranges, ignored errors, watches, scenarios, pivot caches, slicers, controls and supported extension namespaces.
- External workbook references, which retain their external ownership.

Affected calculation caches must be invalidated, calculation chains removed and recalculation requested. Unsupported reference-bearing features must be identified explicitly before edits are accepted; these remain implementation requirements, not completed parity.

## Verification

Test insertions/deletions before, inside and after ranges; entire-range deletion; boundary overflow; ordered interleavings; cross-sheet references; unchanged external references; immutable formatting sources; and inserted-cell mapping. Then verify each package surface with fixtures, undo/session restoration, native archive writeback, atomic failure and original/unrelated-part preservation. Include large sparse workbooks to catch accidental dense expansion and quadratic work.

Reference: Microsoft's [CellFormula schema documentation](https://learn.microsoft.com/en-gb/dotnet/api/documentformat.openxml.spreadsheet.cellformula?view=openxml-2.8.1) describes shared-formula ranges and ownership. The [worksheet element inventory](https://learn.microsoft.com/nb-no/dotnet/api/documentformat.openxml.linq.x.worksheet?view=openxml-2.10.0) identifies additional reference-bearing features outside cell data.

## Current implementation evidence

The source editor now records and validates journals, moves overlay destinations, preserves immutable formatting sources, checks source dimensions/hashes and preflights exports before committing changes or restoring sessions. The package engine handles ordinary workbook formulas and names, basic sheet ranges/views, filters, validation/conditional references, and legacy comments/VML. Native tests cover insertion/deletion, typed and formatting edits, cross-sheet formulas, undo/redo, session restore and archive writeback. Originals remain unchanged.

The supported structural-edit workflows are released in 2.191.0. Source tests now cover shared-formula expansion, table row/column transformations, generated headers, calculated columns, surviving validation/conditional-format anchor rebasing and partial merged-anchor deletion. The editor projects generated cells from the preflight workbook into its result grid. Combined export, shared-formula editing/undo and ordinary structural export regressions pass. Table UI projection passes undo/redo, session restore, subsequent insertion and referenced-column deletion regressions. Each new operation runs against the actual prior workbook draft before deriving final overlays; this prevents stale edited structured references from overwriting the engine rewrite. Native and packaged workflow tests pass on both Mac architectures, including archive writeback; Windows runtime verification remains deferred.

Remaining handlers include charts/general drawings, pivots, array/spill formulas, controls and unknown extensions. Coordinated table-header renaming is included in 2.191.0, including typed editor projection, metadata, supported cross-sheet references and defined names. Sequential rename, undo/redo and session tests pass. Header/totals/full-table deletion and additional structured-reference forms remain unsupported. Broader formula references and external-link metadata remain tracked above. Header edits update table metadata and supported formula owners atomically. Duplicate/nontext headers and unsupported reference owners are rejected before publication.


## Follow-on work released in 2.192.0

Ranges with qualifiers on both cell endpoints now transform each operand independently. Verified Excel deletion behavior preserves a deleted operand as #REF!, unlike an ordinary range that can shrink. Unit and real export/reload tests cover insertion, deletion, dollar anchors, reversed ranges, external references and original-file preservation.

Table header deletion now preserves surviving data in a headerless table instead of promoting a data row. Totals-row deletion clears totals metadata. References to physically deleted header/totals regions become `#REF!`. Deleting a complete table removes its definition, owned relationship and content-type declaration. Export and renderer tests cover undo/redo, session restore and subsequent edits. These are deliberate deletion semantics, distinct from merely hiding a table header; broader interactive parity has not been claimed.

Supported drawing/chart preservation has passed focused, renderer and independent-reader validation; both Mac packaged structural workflows and installed startup smoke now pass in 2.192.0. Genuine three-dimensional sheet spans now retain their shared coordinates during single-sheet row/column operations, following the Excel observations in workbook-3d-reference-observations.md. Degenerate same-sheet spans transform normally. No union rewriting is used.

Subsequent edits now also accept separately qualified ranges that already contain a deleted `#REF!` operand. The error remains while surviving endpoints relocate. A browser regression verifies this after saved-session restoration, with export and undo; 25 focused formula tests pass. The picture regression verifies byte-preserved PNG data, anchor movement, unaffected other-sheet drawings, undo/redo and subsequent edits after restoration. Independent review caught and fixed loss of caches for externally owned chart references. Complete external references retain their chart bytes and caches; local caches invalidate conservatively because unchanged reference text does not prove unchanged source data. A realistic chart fixture with axes and content-type declarations reloads with openpyxl. Native picture preservation through sessions and archive writeback, renderer chart export/restoration, and table deletion/rename regressions pass.
