# Text-only DOC adaptation provenance

`src/doc-text-engine.cjs` adapts the text decoding/control mapping and FIB/FKP interpretation approach from Alpaq92/JSDoc `src/docToText.js`, licensed 0BSD (see LICENSE).

Pinned upstream: https://github.com/Alpaq92/JSDoc/blob/4265b8da29b239f5a7680b01e6c96a6c782aaa7f/src/docToText.js

Upstream file SHA-256: `1480cd409c36b0e8890509516ff6909dffd73a825211e821e1e09b880fc635db`.

Local changes replace the permissive container/FIB reader with bounded preflight; remove HTML/model/images/properties/bookmarks/rendered geometry and generated list numbering; validate style and CHPX/PAPX framing instead of catch-and-ignore/clamping; reject unsupported property indirection, piece PRMs, style-relative deletion toggles and symbol/structural transformations; validate nested field instructions/results; add cumulative work/run/output/depth budgets and cancellation checks. All seven stored story categories remain available. No macro, field, link or embedded-object execution occurs.

Policy `stored-story-text-v1`: direct deletion-marked characters omitted; inserted and hidden characters retained; stored field results only; paragraph/manual/page breaks become newline, qualified table rows/cells become newline/tab, nonbreaking hyphen becomes hyphen, optional hyphen and object/note-reference markers omitted. Related stories retain their raw stored separators, not reconstructed logical references or rendered pages. This is not an all-revisions-accepted rendering. Unsupported property cases fail explicitly.

Primary framing references: [MS-DOC] Sprm, ToggleOperand, PapxInFkp, Character Properties, PlcBteChpx, PlcBtePapx. The inherited upstream assumption that any deletion toggle's low bit suffices was removed: 0x80/0x81 require style-relative semantics and currently refuse.

The related-part adapter consumes validated absolute CP intervals from `doc-story-ranges.cjs`. It captures text offsets during the same seven-story traversal, then slices bounded part strings without repeating property/field parsing. Range boundaries inside active fields or splitting a UTF-16 surrogate pair refuse. Missing character or paragraph property coverage refuses, including non-table text. Both raw stories and related-part text count toward the aggregate output budget.
