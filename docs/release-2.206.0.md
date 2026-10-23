# Further Compare 2.206.0

PDF Text Compare adds an explicit per-side Page rows reading order. It compares supported horizontal left-to-right text by displayed row and position, reducing differences caused solely by different PDF drawing-command order. Document order remains the default. Changed words remain differences; unsupported direction, skew and ambiguous overlap fail explicitly instead of silently falling back. This does not infer logical columns or tables, compare page layout, or perform OCR.

Text options provide Re-extract when the source is available. Failed extraction preserves the current draft, and existing unsaved-change confirmation protects edits. Saved sessions preserve requested preferences separately from actual extraction provenance. Existing Document order sessions keep their version-1 metadata; Page rows uses version 2. CLI and native batch comparisons accept the same policy.

Browser archive entries retain a temporary source File for re-extraction while prohibiting PDF writeback. Saved browser sessions and pathless native snapshots require reopening the PDF. Three-way document extraction remains pending.

Source validation: 2,412 passing tests and one skipped; independent ReportLab fixtures for differing drawing order and real word changes; browser, native IPC, session, failure preservation and original-file/hardlink protection; existing PDF edit/export and external-character-map regressions. Both Mac packages passed PDF ordering and shell-helper workflows. All three source/assets/ZIP audits and download checks passed. Version 2.206.0 is installed with a verified startup smoke and healthy Finder Services; 2.205.0 is retained for rollback.

Windows runtime testing remains deferred. Public signing/notarization and modern Explorer native deployment remain pending. The overall product goal remains incomplete.
