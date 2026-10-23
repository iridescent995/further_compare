# Further Compare 2.31.0

Table Compare offers **Cell values** and **Formulas** when an XLSX input is open. Cell values remains the default. Formulas compares exact expressions, so different formulas with identical cached results are highlighted, while identical expressions with different cached results match. Literal cells still compare by value; a formula and a literal are always distinct in formula mode. Formula expressions appear beneath cached values in each cell.

Shared formulas resolve to the expression at each cell's address. Matching is exact and does not normalize spelling, whitespace or references. No formulas are executed or recalculated. Keyed row pairing continues to use cached values, with duplicate-key detection. Header rows remain labels. Selected sheets and the comparison mode persist across tabs, saved sessions and side swaps.

Use left/right as result continues to copy values. CSV and single-sheet XLSX exports contain literal values, not executable formulas or original workbook styles. Existing input and expansion limits remain in force. Workbook formatting comparison, legacy XLS/XLSB/ODS input and formula recalculation remain unsupported.

Validation: all 236 unit tests passed. Browser and native workbook workflows verified expression/cache distinctions, formula-versus-literal handling, shared references, keyed row alignment, filtering, tab/session persistence, native swap, values-only exports and unchanged source workbooks. Existing workbook browser and native regressions passed.

The formula workflow passed in both final Mac packages. Light and dark screenshots were inspected for readability. All three package versions and changed bundled files match the verified build; ZIP integrity, download links, sizes, SHA-256 checksums and the Windows ZIP browser download passed. Windows runtime validation remains pending on a Windows host.
