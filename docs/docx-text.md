# DOCX text comparison

Status: shipped and installed in 2.188.0. Source, browser and both Mac packages verified; Windows package verified, with runtime testing deferred.

Opening a `.docx` file extracts its main document text into Text Compare. Paragraphs and explicit line breaks retain their boundaries; table cells are separated by tabs and rows by newlines. The interface identifies the input as a DOCX text projection and lists the exclusions. The extracted text can be edited and compared using the existing editor.

This is text extraction, not Word layout rendering. Formatting, styles, numbering labels, headers, footers, notes, comments, drawings, text boxes, equations and embedded objects are excluded. Inserted text and stored field results are included; deleted text and field instructions are excluded. External resources and macros are never executed.

Edits export to a separate text file. Native text export rejects `.docx` destinations and protects the opened source identity, including renamed sources and hard-link aliases across open app windows. Projected remote documents do not receive server-save authority, and projected archive entries cannot apply plaintext back into their document package. Sessions retain the edited text and extraction metadata; reloading extracts the source again.

Package input is bounded to 32 MiB, with a 64 MiB expanded archive limit, an 8 MiB main XML part limit, and bounded XML depth/node counts. Existing editor text limits still apply to extracted content. Encrypted, malformed or unsupported packages fail without replacing the current editor draft.

Validation so far:

- Core extraction tests cover package relationships, strict/transitional namespaces, paragraphs, tables, revisions, malformed XML, expansion limits and immutable input snapshots.
- Browser workflow covers import, comparison, edited text export, session restoration, invalid-input draft preservation and returning to ordinary text.
- Native routing tests cover shell requests, folder pairs and remote staged reads.
- Save-guard tests cover source aliases, source renames between checks, and unrelated output saves.
- Native end-to-end checks cover an input over 10 MiB, side swaps, saved-session restoration, source and alias overwrite rejection across windows, and successful separate text export.
- Existing native save concurrency and disk-error regression checks passed.
- Final full unit run: 1,990 passed, one skipped, zero failed.

Both Mac packages passed the native DOCX and shell URL workflows. All three package sources and ZIP archives were verified, along with Mac signatures and browser downloads. The installed Mac application passed its launch smoke check; the prior 2.187 installation remains backed up.

## Related text (shipped in 2.214.0)

Release 2.214.0 is installed. Text options offers a DOCX scope for each side: main document, or main document plus related text. Changing the selector does not replace a draft. Choose Re-extract and confirm replacement to read the original again. Saved sessions preserve the applied scope and edited draft; a browser session without original bytes requires reopening the document before another extraction. Three-way merge has independent base, left and right scopes.

The additional scope includes referenced footnotes/endnotes and section-associated header/footer variants, including inherited references. Notes use logical encounter-order markers, so incidental package note-ID changes do not create differences. Header/footer labels describe logical variants, not pages rendered by Word. Comments, layout, formatting, equations, drawings and unreferenced stories remain excluded. All requested XML stories share extraction limits. A missing, external or invalid requested story fails the extraction rather than silently reducing coverage.

CLI: add `--docx-scope main-and-related-text` to a text comparison. Batch JSON jobs accept `"docxScope": "main-and-related-text"`; dry-run review includes the selected coverage. Omit the option for the unchanged main-document default. Reports and saved sessions distinguish the version-2 related projection from legacy version-1 main-only extraction. Both policies protect original documents and export edits only as separate text.

Source acceptance (2026-10-23): 2,515 tests passed, one skipped. Independent LibreOffice fixtures, browser two-way/merge and PDF regressions, CLI/batch, and native scope/session/export checks passed. Delayed native reads verified input/menu locking through native and editor publication, plus interaction recovery and draft preservation on failure. Independent review approved the fix. Both Mac packages passed DOCX and shell workflows; all three package/source-map/dependency audits and download checks passed. Installed assets, startup isolation and Finder Services passed. The prior 2.213 app is retained as backup. Windows runtime and public signing remain deferred.
