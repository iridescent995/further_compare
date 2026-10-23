# ODT text comparison

ODT input uses the existing Text Compare editor through an asynchronous, read-only main-document projection. It does not reconstruct visual pages or write ODT packages. Original bytes and native identity protections belong to the shared document input/save/session pathways.

`src/odt-text.cjs` provides `extractOdtText(bytes, {DOMParser})` and `validateOdtProjection(metadata)`. Projection metadata has exactly `kind: 'odt'`, `version: 1`, `scope: 'main-document'`, source paragraph/table counts, and fixed exclusions. It never carries filesystem write authority.

Supported text includes headings and paragraphs, list item text, sections and stored index bodies, inline spans and hyperlinks, stored field display text, explicit spaces/tabs/line breaks, and table cells separated by tabs with rows separated by newlines. Covered cells retain an empty position. Repeated rows/cells have bounded expansion. Nested tables retain text, though their tab/newline representation is not a reversible table serialization. Counts describe visited source paragraphs/tables, not the number of repeated output paragraphs.

The disclosure excludes styles, numbering labels and layout; headers/footers/notes/annotations; drawings, text boxes, equations and embedded objects; tracked-deletion records; and field recalculation. Current body text, including inserted text and stored field results, is included. No scripts, links or external resources execute or load. Empty/image-only documents fail explicitly rather than comparing as empty equal text.

## Opt-in related text (version 2)

The default remains `main-document`, with the exact version 1 projection and exclusions described above. `extractOdtText(bytes, {DOMParser, scope: 'main-and-related-text'})` adds logical note text and stored headers/footers. Version 2 records the selected scope, paragraph/table counts, fixed limitations, and a bounded `relatedParts` list. Note descriptors identify kind and encounter ordinal; header/footer descriptors identify master-page encounter ordinal and stored variant (`default`, `first`, or `left`). This metadata records extraction provenance, not filesystem authority.

In Text Compare, choose the ODT text scope separately for each side and explicitly re-extract to apply a changed scope. Three-way merge offers the same choice for base, left and right. Changing a selector alone does not replace an edited draft or relabel its committed projection. Re-extraction requests confirmation before replacing a draft; cancellation preserves it. Sessions retain committed scope and validated projection metadata, and reject contradictory provenance. Reload/swap and three-way source restoration retain the selected extraction meaning.

Command-line text comparisons accept `--odt-scope main-and-related-text`; the default is `main-document`. Batch text jobs accept `odtScope: "main-and-related-text"`, with the same default. Their reports describe logical extracted text rather than rendered document equality. Documents continue to require automatic input encoding.

Inline notes become stable `[Footnote N]` or `[Endnote N]` markers, with citation text and note bodies appended in encounter order. Storage IDs do not determine those ordinals. Paragraph/table styles and parent-style inheritance resolve referenced master pages; reachable master `next-style-name` chains contribute possible stored variants. Headers/footers are appended with labelled page-style ordinals and variants. Unused master-page stories are omitted. Continuing body paragraphs do not duplicate a header for imagined pages. **These associations do not reconstruct pagination or establish which header appeared on a particular rendered page.** Stored field and citation text is not recalculated.

Missing or ambiguous style associations, cyclic/excessive paragraph-style inheritance, conditional style maps, duplicate/invalid notes or variants, nested notes, notes inside headers/footers, and notes inside repeated table cells/rows fail explicitly. Unsupported input does not silently fall back to body-only comparison. Images, drawings, annotations, embedded objects, visual formatting and layout remain excluded. Original ODT packages are immutable inputs: editing changes the extracted text draft, and saving exports a separate text file. This feature does not preserve edits back into ODT or grant permission to overwrite original documents or aliases.

Related extraction shares the package/XML/text budgets below. Styles XML is also limited to 16 MiB; collected paragraph/table styles and master pages share a 10,000-item bound. Parent-style resolution is capped at 128 hops and charged against the shared one-million work budget; style descriptors are normalized once to avoid repeated child scans. Notes and related-part descriptors are bounded at 10,000. Limits reject before publishing a partial projection.

The [independent fixture provenance](../test/fixtures/odt-related-independent/README.md) records authored Flat ODF converted to genuine LibreOffice ODT, then independently reloaded through UNO with macros and external updates disabled. It verifies notes, inherited First/Second page styles, and an unused master page. The related-only fixture pair has identical main text. Independent tests additionally check stable note-ID renumbering and unused-story edits. Browser/native tests cover explicit scope, cancellation, drafts, session provenance and original-byte protection; three-way browser and CLI/batch tests also pass. The full source regression suite passed before release 2.222 packaging. Packaged and installed acceptance are separate release gates and are not implied by these source checks.

## Package and resource boundaries

- Canonical first stored `mimetype` identifies `application/vnd.oasis.opendocument.text`; package/manifest namespaces and body type must agree.
- Input is copied before asynchronous reads. Maximum input 32 MiB, 4096 package entries, 64 MiB total expanded archive bytes. Every file is read for CRC/size validation, even excluded parts.
- Manifest paths must be unique, safe and present; non-metadata files must be manifested. Encrypted or extended manifest entries are rejected explicitly.
- Shared ODF XML parser prohibits DTD/entities and processing instructions, rejects parser errors and invalid encoding, and bounds nesting at 128 and nodes at 500,000. Content XML is at most 16 MiB; manifest at most 1 MiB.
- Output is at most 8 MiB UTF-8, with 100,000 source paragraphs/tables, 100,000 row/cell repetition bounds, 1,000,000 text-work steps and 64 MiB cumulative intermediate text materialization. Exceeding a limit fails before publication.

## Independent evidence

`test/odt-fixtures/fc-odt-producer.odt` and `fc-odt-right.odt` were produced by LibreOffice from controlled HTML, not by this parser. They cover Unicode, explicit line breaks, lists and a two-column table. LibreOffice TXT conversion independently reproduced content, adding its own list bullets/indentation; the main-document projection intentionally excludes numbering labels.

`test/odt-text.test.cjs` covers this independent producer, content/exclusion policy, table repetitions, input immutability, strict package/XML rejection, empty documents, UTF-8/work limits, and exact saved-projection metadata. `test/odt-produce.cjs` regenerates the fixtures. Shared routing, editor, save and packaged acceptance are separate integration gates; parser tests alone do not prove them.

Remaining document scope includes legacy DOC, OCR, visual layout comparison, arbitrary user converters, and broader PDF/font reading-order fidelity. ODT editing/preservation and encrypted ODT input remain unsupported; this feature is text comparison and separate text export.

## Release 2.202 acceptance

Released and installed after 2,276 passing unit tests (one skipped), five routing/session/guard/CLI/batch tests, final browser/native acceptance, and both ARM64/Intel packaged ODT workflows. Original files, aliases and archive bytes remained unchanged. Independent review corrected numbered/index paragraph omission, script-source inclusion and citation omission. A native package dependency regression now checks all relative document-decoder modules after package review caught an omitted parser dependency. Corrected package source/assets, signatures, ZIP/download checks, installed startup and Finder Services passed. Windows execution remains deferred.

## Release 2.222 acceptance

Released and installed after 2,684 passing source tests (one skipped), independent LibreOffice fixture/readback qualification, browser/native and three-way scope acceptance, and packaged native tests on Apple Silicon and Intel. All three packages passed exact decoder dependency and renderer-source checks. ZIP, download hashes, installed startup and Finder Services checks passed. Windows runtime testing remains deferred. The installed update retains a reversible backup of 2.221.
