# Release 2.99.0 — unified patch export

Two-way text comparisons can export the current left-to-right edits as a unified patch from File or Filters & options. The preview captures current unsaved buffers and offers 0–100 context lines. Export always uses exact text, regardless of active whitespace, case or display filters. It does not modify either compared file or the session.

Generation runs in a cancellable worker with input-size, line-count, diff complexity and timeout limits. The preview is bounded while export retains the complete patch. Identical inputs disable export. Header labels retain sanitized base filenames without local directory paths. Invalid Unicode is rejected rather than silently replaced.

Patches are UTF-8 without a BOM; source encoding and BOM metadata changes are not represented. Raw text line endings and missing final newlines are retained. Browser export downloads a patch; desktop export uses the existing native Save dialog and atomic data writer. This release adds patch creation; patch application remains a separate unfinished workflow.

All 803 unit tests passed, including 20 patch cases checking applyPatch round trips, Unicode, CRLF/mixed line endings, insertion/deletion, EOF newlines, exact case/spacing, header safety and limits. UI and package validation follow below.

Final validation: browser, source desktop and both Mac packages passed exact unsaved patch export despite ignore-case, round-trip application, cancellation, context validation, identical inputs, missing final newlines, preserved editor/session state and native menu/save routing. Immediate close/reopen coverage exposed a delayed-close event race; the fixed handler preserves the new preview. The borderless preview was visually inspected. Live-editor and10,000-line surface regressions passed. All three package assets/versions and ZIPs verified; download links, sizes, checksums and Windows ZIP browser download passed. No reference branding appeared in shipped source. Windows runtime remains unverified.
