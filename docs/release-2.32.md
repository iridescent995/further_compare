# Further Compare 2.32.0

XLSX comparisons now offer **Compare formatting** alongside the values/formulas selector. With this enabled, a stored formatting difference makes the cell different even when its values or formulas match. Supported groups are number format, font, fill, border, alignment, protection and rich-text runs. Cell styles inherited from rows or columns are included.

Changed cells list the formatting groups that differ. Expand the detail to inspect the stored properties on the left and right. The option combines with formula comparison and cached-value keyed row matching, and persists through tab changes, saved sessions and swaps. Header rows remain labels. Results and CSV/XLSX exports remain values-only; input files are untouched.

Comparison uses canonical stored properties rather than rendered appearance. Property order and empty objects do not create differences; General number formats and explicit pattern-none fills normalize to defaults. Other explicit properties remain significant. Theme rendering, conditional formatting, merged ranges and row/column dimensions are not compared. Formula recalculation is not supported.

Repeated styles share cached signatures. Individual signatures are limited to 65,536 code units and unique formatting text across a comparison to 32 Mi code units, in addition to existing workbook bounds.

Validation: all 243 unit tests passed, including a 500,000-cell repeated-style case per side. Browser and native formatting workflows covered all supported groups, inherited styles, expanded property inspection, formula combinations, keyed/header alignment, filtering, sessions, tabs, swapping, plain-value exports and unchanged originals. Existing workbook value/formula regressions passed. Light and dark screenshots were inspected for readability.

The formatting workflow passed in both final Mac packages. All three package versions and changed bundled files match the verified source. ZIP integrity, download links, sizes, SHA-256 checksums and the Windows ZIP browser download passed. Windows runtime verification remains pending on a Windows host.
