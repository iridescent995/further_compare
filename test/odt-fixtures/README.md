# Independent ODT fixtures

Generated on 2026-10-22 using bundled LibreOfficeDev 26.8.0.0.alpha0, build `2c87e51eeaa2b413ff4ae097b2705eea1995d8e5`, with `soffice --headless --convert-to odt`. Source: controlled HTML created by `test/odt-produce.cjs`; no user documents. Left/right differ only in the table value LEFT/RIGHT.

Independent readback used `soffice --headless --convert-to txt:Text`. It reproduces all text including Unicode, multiline paragraphs and tab-separated table cells; LibreOffice adds bullet labels/indentation which this projection explicitly excludes.

Regenerate with `node test/odt-produce.cjs` when the bundled `soffice` wrapper is available. Binary ZIP timestamps can differ between generations.
