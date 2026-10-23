# ODS table input

Further Compare reads ODS worksheets as stored cell values. It does not calculate OpenFormula expressions or preserve an ODS package when exporting an edited result.

## Supported workflows

Open an ODS directly in Table Compare, from a folder comparison, from a connected provider, through a shell comparison request, or as an archive entry. Choose the left and right worksheets independently. ODS can be compared with another ODS, XLSX, CSV or TSV using positional rows, headers and key columns.

Use a complete worksheet as the result, edit literal result cells, copy selected cached values, insert/delete result rows and columns, and undo/redo. Results export as CSV or a new values-only XLSX. Original ODS bytes remain attached to saved sessions; sheet selection, edited result and copy binding persist. Capabilities and cell provenance are reconstructed from those bytes when restoring, rather than trusted from session flags.

An ODS result cannot become a source-preserving XLSX template. In mixed comparisons, choosing the XLSX side as the result retains the existing XLSX preservation behavior. ODS copied values remain values; OpenFormula is never translated into an Excel formula. XLSX typed cells and formula copies into an XLSX result retain their existing semantics. An XLSX formula copied into an ODS values-only result uses its displayed cached value.

## Value interpretation and unavailable results

- Finite numeric and percentage values use their stored number, with deterministic numeric text. Booleans display `true` or `false`.
- Currency values include their stored three-letter currency code. Dates and time durations retain their validated lexical values, including timezone information; they are not converted into Excel serial dates.
- Strings flatten supported text paragraphs, spans, spaces, tabs and line breaks. Covered cells preserve worksheet positions as blanks.
- Formula text and its namespace remain provenance. Cached results are compared as values; formulas are never evaluated.
- A formula without a stored result appears as unavailable. Its cell is never marked equal, even against another unavailable result or literal text matching the displayed marker. Unavailable cells remain visible with Differences only enabled. Selective copying of such a cell is refused, and a sheet containing any unavailable formula cache cannot initialize a result. Recalculate and save the source in a spreadsheet application first, or choose a complete opposite worksheet.

Current source enables namespace-aware exact formula-expression comparison for ODS. Formula prefixes are resolved to namespace URIs; whitespace, quoted content and reference spelling remain significant. Different formula dialects are not treated as equivalent. Formula mode does not require cached results; repeated formula cells with unqualified reference semantics are explicitly unavailable and never marked equal. Formatting and layout comparison remain disabled. The input disclosure describes these restrictions. Original ODS archive-entry writeback is also unavailable.

## Source protection

Table exports cannot target an ODS filename. Native exports also check retained ODS source paths and file identities, protecting renamed sources and hard-link aliases. Existing destinations with the canonical ODS package marker are refused, including aliases selected after restoring a session. Export a separate CSV or XLSX file instead. These checks restrict output; session metadata does not grant native write authority.

## Limits and unsupported content

The reader admits packages up to 32 MiB, with at most 4096 entries and 64 MiB of expanded data. `content.xml` is limited to 16 MiB and the manifest to 1 MiB. XML work is bounded to 500,000 nodes and 128 nesting levels. The table model supports at most 64 sheets, 50,000 rows and 512 columns per nonempty extent, and 500,000 aggregate rectangular cells. Projected value/provenance text is limited to 32 MiB; individual cell text is bounded to 1 MiB. The browser file picker retains its existing 16 MiB input limit.

The package must have the canonical first, uncompressed ODS `mimetype` entry and a valid manifest. Duplicate/unsafe paths, malformed XML, DTD/entity declarations, encryption declarations and unsupported manifest extensions are rejected. Advertised and actual decompression sizes are checked. Empty trailing row/column repetitions are skipped without materializing an enormous worksheet; nonempty repeats must fit the cell limits.

Scripts, links and embedded resources are not executed or fetched. Existing stored external-data caches may be displayed, but they are not refreshed. Supported merged cells retain positional covered blanks; overlapping merges, missing covered positions, repeated merged anchors, covered cells with stored content, nested tables and unsupported table structures are refused. This milestone does not provide rendered-style equivalence, formula calculation, cross-format formula equivalence, or lossless ODS editing. XLS/XLSB cached-value input is available separately.

## Validation boundary

Committed acceptance fixtures were generated by LibreOfficeDev 26.8.0.0.alpha0 from controlled inputs; see [fixture provenance](../test/ods-fixtures/README.md). Parser, browser and session tests cover cached values, repeated/covered positions, malformed packages, comparison restrictions, missing-cache behavior and values-only workflows. This evidence does not establish Microsoft Excel-produced ODS interoperability, formula-calculation correctness or lossless writing. Native package and Windows execution claims must come from their separate release checks.

Release 2.200.0 passed 2,240 unit tests (one skipped), browser and native ODS acceptance, both ARM64 and Intel packaged workflows, and independent openpyxl export readback. Package source/signature/ZIP/download checks and installed Mac startup passed. The Intel harness waits for both folder sides to finish loading before opening a file. Windows package integrity passed; Windows execution testing remains explicitly deferred.
