# Independently produced binary DOC fixtures

These documents were authored as Flat ODF (`*.fodt`), exported with LibreOffice's `MS Word 97` filter, closed, and independently reopened with LibreOffice UNO. Producer/readback: LibreOfficeDev 26.8.0.0.alpha0, build `2c87e51eeaa2b413ff4ae097b2705eea1995d8e5`, on 2026-10-23. The authoring source and producer never import the application's extractor or parser.

`baseline.doc`, `related-changed.doc`, `body-changed.doc`, and `anchors-moved.doc` are genuine office-suite-produced CFB Word documents, with pinned hashes. `related-changed.doc` changes the first header/footer, footnote, endnote, annotation, body textbox and header textbox while keeping the body identical. `body-changed.doc` changes one body phrase while keeping related stories identical. `anchors-moved.doc` keeps all seven stored story strings unchanged while moving the footnote anchor from after “alpha” to after “middle”, and the comment anchor from after “omega.” to after “Body final.”. It was independently exported and reopened by the same LibreOffice producer, not patched by an application parser. This controls reference placement: main text stays equal, while the explicit full-related projection must differ. `sha256.json` pins binary fixtures and authored sources.

The independently reopened content covers Latin accents, Greek, CJK, a supplementary-plane emoji, paragraph breaks, a tab, a manual line break, a two-by-two table with one empty cell, a fixed date field, footnote/endnote, two page styles with distinct headers/footers, a body text frame, a header text frame and an annotation with author/content. An unused authored page style is not present among the in-use readback pages. This fixture does not imply universal Word version, revision, hidden-text, encryption, arbitrary field, drawing or table-layout support.

`libreoffice-readback.txt` is the raw independent oracle. `expected.json` is its mechanical transcription by `manifest.py`, retaining body, notes, in-use page styles, paragraph assignments, individual table cells, text frames, annotations and field results. The BODY record includes table cell text and note citation labels as LibreOffice exposes them; these are not instructions to impose a particular application serialization. Related stories are separately recorded, so a body-only extractor cannot masquerade as complete document text coverage.

Observed conversion details are retained rather than normalized away:

- The fixed date's displayed result becomes `05/04/24`, while authored FODT supplied `05/04/2024`.
- Footnote and endnote text returned by UNO begins with a tab.
- Page styles become `Standard` and `Convert 1`, the table `Table1`, the body textbox `Frame1`, and the header textbox `Frame2`.
- The body text includes the note citation labels `1` and `i`; the textbox's text is separate from its body anchor.
- Physical page counts and rendered field recalculation are not part of this oracle.

## Reproduction

`ProduceDoc.java` is the complete export/readback program. It loads every input and output with the named UNO constants `MacroExecMode.NEVER_EXECUTE` and `UpdateDocMode.NO_UPDATE`, plus Hidden and ReadOnly. No external targets are present in these sources. It terminates only its own isolated LibreOffice desktop at completion.

Compile against the official LibreOffice UNO Java library (used `org.libreoffice:libreoffice:24.2.7`), start a fresh isolated profile using `--headless --norestore --nodefault --nofirststartwizard` and `--accept=socket,host=127.0.0.1,port=20425;urp;StarOffice.ServiceManager`, and run `ProduceDoc` with absolute paths to the four `.fodt` files. Capture stdout as `libreoffice-readback.txt`, then run `python3 manifest.py`. Binary metadata/timestamps may differ after regeneration; compare the independent story values and record fresh hashes deliberately.

Production completed with both producer and isolated office process exiting zero. No application conversion was used for expected output. Synthetic malformed derivatives, if added by parser tests, must be labelled separately from these valid producer fixtures.
