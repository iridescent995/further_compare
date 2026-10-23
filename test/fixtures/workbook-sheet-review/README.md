# Independent sheet inventory fixtures

`produce.py` authors the XLSX pair using openpyxl (independent of the application reader). `openpyxl-expected.json` records reopening the actual saved XLSX, including names, original order, visibility, formula strings, number formats and styled blank C5.

LibreOffice converts each XLSX separately to XLS and ODS. `readback.py` inventories a separate LibreOffice conversion of those XLS/ODS originals back to XLSX, read with openpyxl. `libreoffice-readback.json` records the outcome; this is producer readback evidence, not an app-generated expectation. `sha256.json` identifies the six original artifacts.

Baseline: Overview, Hidden Δ, Secret, Empty, Café 中, Removed.
Changed: Added, Café 中, Overview, Secret, Hidden Δ, Empty, Renamed.
Exact-name pairing must leave Removed unmatched; Renamed has identical data but is not an inferred rename. Added is another unmatched sheet. Hidden Δ B3 alone changes numeric value from20 to21. Café 中 B2 changes only number format 0.00 to0.000. Overview B4 formula is SUM(B2:B3); openpyxl supplies no formula cache, while LibreOffice calculates30. Empty has no literal values but C5 is styled.

Visibility qualification: original baseline XLSX Secret is veryHidden, changed XLSX Secret is hidden. LibreOffice normalizes veryHidden to hidden when producing BOTH XLS and ODS, so both converted Secret sheets are expected hidden. Never infer that the independently produced XLS fixture proves veryHidden retention. Hidden Δ is hidden in all six originals. Other sheets are visible.

Existing genuine XLSB evidence is reused at ../../xlsb-fixtures/pandas-test1.xlsb with its existing license/provenance. Its independently LibreOffice-converted pandas-test1-libreoffice.xlsx yields four visible sheets Sheet1..Sheet4. No synthetic file is represented as a genuine XLSB producer output.

Reproduction (run from repository root):

1. Bundled Python: `python3 test/fixtures/workbook-sheet-review/produce.py`.
2. `soffice --headless --convert-to ods --outdir test/fixtures/workbook-sheet-review test/fixtures/workbook-sheet-review/{baseline,changed}.xlsx`.
3. Repeat with `--convert-to 'xls:MS Excel 97'`.
4. Convert ODS into `/private/tmp/fc-sheet-review-readback/ods` and XLS into `/private/tmp/fc-sheet-review-readback/xls` using `--convert-to xlsx`; never overwrite original XLSX.
5. `python3 test/fixtures/workbook-sheet-review/readback.py`.

These are small machine-test workbooks, not presentation reports. No formula calculation or broad legacy fidelity claim is implied by this inventory qualification.
