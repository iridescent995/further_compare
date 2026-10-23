# Independent ODS preservation fixture

`baseline.ods` was produced by LibreOfficeDev 26.8.0.0.alpha0
(commit 2c87e51eeaa2b413ff4ae097b2705eea1995d8e5) using
`node test/ods-preserve-independent-produce.cjs` on 2026-10-23.
The original authored input is created by ExcelJS and converted by LibreOffice;
no Further Compare writer produces this baseline. It contains two sheets,
number and fill/font styles, Unicode, whitespace, repeated literal values,
a literal beginning with `=`, and same-sheet/cross-sheet formulas.

The acceptance test checks raw ZIP payloads and namespace-aware XML independently
of the product reader, then asks LibreOffice to recalculate and exports XLSX for
independent logical value/formula/style readback. Formula expected results derive
from literal arithmetic, not from the application reader. LibreOffice runtime
qualification is separate from static package checks. This is not evidence of
Microsoft Excel-produced ODS compatibility.
