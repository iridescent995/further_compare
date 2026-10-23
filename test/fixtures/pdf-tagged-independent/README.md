# Independent tagged PDF feasibility fixtures

`baseline.pdf` and `untagged.pdf` are real LibreOffice Writer PDF exports of
original authored Flat ODF, using `python3 produce.py`. Producer: LibreOfficeDev
26.8.0.0.alpha0 (2c87e51eeaa2b413ff4ae097b2705eea1995d8e5), 2026-10-23.
UseTaggedPDF true/false distinguishes them. One page has a heading, two columns,
Café/Ω Unicode, and a final paragraph. This qualifies logical tags, not visual
pagination or general PDF accessibility compliance.

`derive.py` uses independent pypdf 6.10.0. Run it with the bundled runtime Python:
`/Users/harshit/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 derive.py`.
These derived packages are explicitly not unmodified producer output:

- `drawing-row-major.pdf`: content-stream blocks reordered 0,1,3,2,4,5 while
  structure-tree order stays 0,1,2,3,4,5. Each block has balanced q/Q and absolute
  text coordinates. Visual glyph positions and logical association are unchanged;
  drawing order differs from logical order.
- `duplicate-mcid.pdf`: content MCID3 replaced with MCID1; ambiguous duplicate
  mapping and missing mapped content must not silently produce success.
- `unmarked-text.pdf`: MCID3 BDC/EMC wrapper removed but glyphs retained; coverage
  is incomplete even though a structure tree remains.
- `artifact-text.pdf`: MCID3 wrapper replaced with Artifact; tests explicit
  artifact exclusion versus stale structure references.

`expected.json` contains independently authored logical paragraphs. `structure.json`
was inspected using pypdf, not PDF.js or the product extractor. The baseline tree
is Document→H1/section/P nodes; leaf MCIDs are 0..5 in logical order. There is no
claim of PDF/UA certification, rendered reading order equivalence, or Microsoft
Office/PDF producer interoperability beyond these fixtures.

Independent Poppler `pdftoppm -r 72 -singlefile` confirms baseline and derived
row-major PDFs render to identical PPM bytes (1,505,511 bytes), SHA-256
`85cc4b106bd07e80f8557a9322844c680b67071d5de07b59152d72f4b4617a15`.
Thus the drawing-order mutation has not changed the visible page in this fixture.

Additional coverage:

- `table-list.pdf` is genuine LibreOffice tagged output from
  `produce-table-list.py`: two-column table with TH header and TD body cells,
  and a bullet list with L/LI/Lbl/LBody roles. Independent pypdf inspection is
  retained in `table-list-structure.json`. Expected cell/list contents are in
  `expected.json`; flattening semantics are a separate extractor policy choice.
- `artifact-footer-valid.pdf` is a labelled derived package: final paragraph's
  marked-content block becomes Artifact, its structure leaf is removed, and
  ParentTree entry5 is null. Unlike `artifact-text.pdf`, no structural reference
  remains to the artifact. Expected logical text excludes the final paragraph.
  Poppler rendering is byte-identical to baseline, with the same PPM SHA-256
  `85cc4b106bd07e80f8557a9322844c680b67071d5de07b59152d72f4b4617a15`.

Production qualification edge fixtures (`produce-edge-cases.py`, same independent
LibreOffice producer): `empty-cell-table.pdf`, `spanning-table.pdf`,
`nested-table.pdf`, and `inline-styles.pdf`. Authored expectations are in
`edge-expected.json`, with independent pypdf structure inventories per fixture.
Empty table positions matter even without glyphs; a two-column spanning cell is
not two independent cells. Nested tables must either retain an explicit qualified
separator convention or be rejected. These fixtures do not imply those profiles
are supported until the production extractor's acceptance tests establish that.
