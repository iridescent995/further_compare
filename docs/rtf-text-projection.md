# RTF text comparison

RTF documents open as editable text projections through the browser, desktop, folder/shell, remote-folder and archive-child workflows. The same decoder serves command-line and batch comparisons. This is text extraction, not an RTF layout renderer or writer.

`src/rtf-text.cjs` parses bytes with scoped group state. It handles Unicode escapes and fallback counts, Unicode alternate groups, escaped characters, declared code pages/font charsets, paragraphs, line breaks, tabs, table separators, and stored field-result text. Binary payload lengths are consumed exactly; their braces and control bytes are never parsed as document syntax. No field is evaluated and no linked or embedded resource is opened.

Nontext and unknown ignorable destinations, headers/footers, notes/comments, formatting, numbering labels, graphics/objects, hidden/deleted text, and field instructions are excluded. Each projection records these exclusions in strictly validated session/report metadata. Unsupported alternate HTML/font representations, DOS code pages, encoded Symbol fonts and unknown encodings fail explicitly. Supported ordinary code pages include Windows 1250–1258 and 874, Shift-JIS, GBK, Korean, Big5, Macintosh and UTF-8. Unicode escapes can represent text independently of an encoded font.

Input is bounded to 32 MiB, output to 8 MiB, nesting to 128 levels and lexical work to one million tokens. Text runs decode incrementally. Malformed groups, binary lengths, escapes and invalid Unicode refuse before returning a projection. Text is not obtained by stripping markup with a regular expression.

Edits save as text with a `.txt` suggestion. Existing document-save guards prevent overwriting the source document, its hardlink aliases or another `.rtf`/`.docx`/`.pdf` path with extracted text. Projected archive children cannot apply edits back to a binary document entry. Saved sessions retain edited text plus projection provenance. CLI and batch reports disclose extraction and require automatic input encoding for document formats.

## References

- [Microsoft RTF syntax](https://learn.microsoft.com/en-us/previous-versions/office/developer/office2000/aa140284(v=office.10))
- [Microsoft RTF reader state](https://learn.microsoft.com/en-us/previous-versions/office/developer/office2000/aa140286(v=office.10))
- [Microsoft plain-text encoding into RTF](https://learn.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-oxrtfex/1e44fa4c-3ea3-402f-a8c7-41a85024caf7)

## Acceptance

An independent macOS `textutil` producer fixture is committed under `test/rtf-fixtures`. Core and browser tests cover it alongside Unicode/codepage, formatting invariance, binary/ignored destination, malformed-input and resource-bound cases. Integration tests exercise strict sessions, local/remote/shell routing, source identity protections, CLI and batch reports. Release 2.199.0 is installed and verified. Both ARM64 and Intel packages passed direct/folder/archive routing, merge/undo, edited sessions, text-only export and source/hardlink protection. The full unit suite passed 2,212 tests with one skip. Package integrity, download checksums, installed startup and Finder Services checks passed. Windows runtime testing remains deferred. Detailed evidence is recorded in `implementation-plan.json`. Rich-document rendering fidelity and RTF writeback are not claimed.
