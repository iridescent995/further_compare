# Independent ODS acceptance fixtures

`fc-ods-left.ods` and `fc-ods-right.ods` were produced on 2026-10-22 by the bundled **LibreOfficeDev 26.8.0.0.alpha0**, build `2c87e51eeaa2b413ff4ae097b2705eea1995d8e5`, using `soffice --headless --convert-to ods`. Inputs were controlled ExcelJS XLSX files, not user documents. They contain two sheets, cached formulas, numeric/boolean values, Unicode and multiline text; LibreOffice emits repeated trailing empty cells up to column 16384.

Data sheet rows: `id,value,note`; `alpha,10,Café Ω中🚀`; `beta,SUM(B2,2),two\nlines`; `gamma,true,same`. Right changes alpha to 20. LibreOffice stores computed caches 12 and 22 for beta, and represents the boolean as `of:=TRUE()`. Other sheet: `key,value`; `date,2026-10-22` (string); `literal,=SUM(1,2)` (literal string).

These prove interoperability with this LibreOffice producer, not Microsoft Excel-produced ODS, formula calculation by Further Compare, style fidelity or lossless ODS writing. The deliberately malformed fixture is derived in memory by replacing content.xml with a DTD/external entity document.

Regenerate using `node test/ods-produce.cjs`; requires the bundled `soffice` wrapper on PATH. The generator uses only temporary controlled inputs and overwrites these two fixtures.
