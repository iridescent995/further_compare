# Further Compare 2.44.0

XLSX **Compare layout** now includes formula display, row/column headings, zero-value visibility, ruler, outline symbols and page whitespace. These are worksheet view differences, independent of the selected cell-value/formula comparison mode. Explicit defaults compare equally to omitted defaults; invalid boolean values are rejected.

The layout-difference table now keeps left and right columns equally wide, with long setting lists wrapping within their cells. Light and dark rendering were inspected.

All 432 unit tests passed. XLSX integration fixtures verify each display flag, explicit defaults, malformed flag rejection, unchanged value results, equal column widths, sheet switching, native session save/reopen, swap, values-only export and unchanged original files. Both packaged Mac architectures passed the workbook-layout suite. All three archives passed ZIP integrity and version/source checks. Download links, sizes, SHA-256 and an actual Windows ZIP browser download passed. Windows runtime verification remains pending. Additional page/print settings, themes and conditional formatting remain outstanding.
