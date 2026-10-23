# Tagged PDF text ordering integration plan

Source implementation, 2026-10-23. The opt-in API value is `tagged-structure`. Browser, native two-way/three-way, session, Node, CLI and batch integration is implemented; existing extraction defaults remain unchanged. Release 2.216.0 contains this feature and is installed locally. The sections below preserve the original design and qualification plan; the current acceptance record supersedes their historical prototype-only status.

## Intended behavior

Add an explicit reading-order choice for PDFs whose text can be completely and unambiguously associated with the structure exposed by the installed PDF.js engine. Preserve `document` as the default and preserve the exact existing `document`, `page-rows`, and `page-columns` results and provenance. Presence of tags must never automatically change a comparison.

The proposed first policy follows structure order **within each page**, retaining physical page order and the existing page separator. Label it “Tagged structure order” and explain this scope. The page-local PDF.js API is not evidence that global structure-tree ordering across pages, articles, or continued tables is reconstructed. Do not advertise full logical-document reconstruction, accessibility conformance, OCR, or rendered-page fidelity.

Use marked-content identifiers to associate extracted text with structure leaves. This is an ordering policy for existing text, not substitution of arbitrary alternative text or evaluation of document actions. Never silently drop text, repeat a leaf, append unassociated text in geometric order, or fall back to another policy while retaining tagged-order provenance. Unsupported coverage should fail atomically with guidance to choose another explicit policy.

## Current source and integration inventory

| Layer | Current entry point | Required integration |
| --- | --- | --- |
| Shared extraction | `src/pdf-text-core.mjs:extractPdfText` | Extend strict order validation and dispatch; collect marked-content events and structure under the existing worker/deadline; keep old extraction paths unchanged. |
| PDF.js API | installed `pdfjs-dist/types/src/display/api.d.ts` | `getStructTree()` provides page structure; `streamTextContent({includeMarkedContent:true})` exposes marker events. Prototype ID correspondence, chunk boundaries and nesting before assuming complete coverage. |
| Browser wrapper | `src/pdf-text-browser.js:extractPdfTextInBrowser` | Admit the new order, preserve local asset origin checks, deadline, abort and worker termination. |
| Extraction exports | `src/pdf-text-extractor.js` | Export any new shared exclusion/provenance constants required by tests or transports; no separate converter. |
| Electron service | `desktop/pdf-text-service.cjs`, `desktop/pdf-text-preload.cjs`, `src/pdf-text-service-entry.js` | Extend request validators on both sides; service already binds returned projection order to requested order. Keep isolated service, bounded queue/bytes and sender validation. |
| Standalone Node | `src/pdf-text-node.cjs`, `src/pdf-text-node-child.cjs` | Extend both strict allowlists and framed request order byte. Existing byte meanings are 0=document, 1=page-rows, 2=page-columns; propose 3=tagged-structure and reject all other values. Preserve frame length checks, child kill/deadline, stderr/output limits, local resources and metadata agreement. |
| Document decoder | `src/text-input.cjs:decodeTextInput` | Admit `options.pdfOrder`, forward it, validate returned projection and exact policy agreement. Other document types and plain-text decoding retain existing behavior. |
| Two-pane browser | `src/app.js`, `compare.html` | Add option to both `pdfOrderA/B` selectors; use existing object-based decoder and confirmed re-extraction. Keep original input bytes separate from editable projection. |
| Native input paths | `desktop/window-runtime.cjs:pdfReadOptions`, `stageText`, `text:open`, `text:open-path`, `text:reload` | Extend strict options validation; default reload retains committed native projection order. No renderer-chosen converter/path authority. |
| Three-way merge | `src/advanced.js:readMergeInput`, `changeMergePdfOrder`, `mergeDocumentControls`, `setType` | Extend select and strict map validation for base/left/right, confirmed replacement, cancellation and late-result checks. Preserve unrelated drafts and original packages; successful replacement clears affected derived output/choices/history as current policy does. |
| Session validation | `desktop/sessions.cjs`, browser restore in `src/app.js`, merge restore in `src/advanced.js` | Extend `pdfOrders:{a,b}` / `mergePdfOrders:{base,a,b}` policies, enforce applied-policy/provenance agreement and retain legacy acceptance. |
| CLI | `scripts/compare.cjs` | Add `--pdf-order tagged-structure` to help and text-only allowlist; preserve original-byte snapshots, cancellation, report provenance and exclusive output publication. |
| Batch | `scripts/batch.cjs`, existing `desktop/batch-service.cjs` review binding | Extend job validation/help and `documentConversions` dry-run description. Forward via `argvForJob`; policy is part of the reviewed plan. Dry run must not promise source tags are usable without extraction. |
| Reports/package | `src/document-projection.cjs`, report consumers, `scripts/build*.mjs`, `package.json`, `test/pdf-order-package.cjs` | Version and validate provenance; ensure any new helper is explicitly packaged and represented in browser/service source-map audits. Existing report schema should retain validated metadata without unsupported ordering claims. |

Initial shell, folder, archive-entry, remote-child and drag/drop routes remain on their current default unless an existing explicit per-side choice applies. Archive/projected inputs cannot write extracted text back into PDF. A browser session storing only a projection must require reopening the original file before changing policy. Do not reconstruct original bytes from the text draft.

## Strict engine qualification

The prototype must define and prove all of the following before selecting an admitted subset:

1. Each nonempty extracted text item has a unique association with one supported marked-content context and one structure leaf. IDs are scoped appropriately for pages, streams and Form XObjects; identifiers from different scopes must not collide.
2. Marked-content begin/end state survives stream chunks; malformed nesting, missing ends, duplicate IDs, duplicate references, missing references and unresolved structure nodes fail. Multiple fragments legitimately belonging to one marked-content item retain their extraction order exactly once.
3. Structure traversal is iterative or depth-bounded, with shared node/reference/item/output budgets. Cycles, excessive depth, repeated expansion and adversarial graphs terminate without partial publication.
4. Object-reference leaves, annotations/forms, images, empty structural nodes, artifacts, and text outside tags have an explicit tested policy. Nontext nodes may be excluded only consistently with the declared text-only scope. Nonempty unassociated/artifact text cannot disappear silently; reject until a separately disclosed, qualified policy exists.
5. `/ActualText`, alternative descriptions, ligature replacement and PDF.js normalization must be characterized. Do not assume the text stream represents stored replacement strings, or add replacements that duplicate already substituted text. If reliable detection/association is unavailable, record a blocker rather than claiming semantic text equivalence.
6. Define separators independently of content/drawing order. Paragraph and table boundaries must not be guessed from moving old `hasEOL` flags between leaves. Specify the supported roles and deterministic whitespace policy; test inline spans, empty items, adjacent fragments, list/table roles, RTL and vertical/rotated text. Reject ambiguous cases before claiming supported reading order.
7. Page-local tree extraction must complete before `page.cleanup()` and before publication. Preserve all existing resource-failure detection and worker teardown on success, error or cancellation.

Retain current admission limits: 32 MiB input, 8 MiB UTF-8 output, 1,000 pages, 1,000,000 text items and 30 seconds. Add explicit bounds for marked-content events, nesting, structural nodes and reference identifiers; charge work cumulatively across pages. These limits do not prove PDF.js itself never allocates larger intermediate trees, so the terminable process/worker and deadline remain necessary.

An untagged document or text-bearing page without an admissible tree should return an actionable `DOCUMENT_ORDER_UNSUPPORTED`. Empty pages may remain empty only when independently verified to contain no extractable text. A document containing some admissible pages and some unsupported text-bearing pages fails as a whole. No mixed tagged/geometric output in this first policy.

## Artifact-text decision before implementation

Common headers, footers and page numbers may be tagged as artifacts; rejecting every document with artifact text could make the new policy impractical. The prototype must characterize genuine producer output before deciding. Two honest alternatives are under review: reject text-bearing artifacts with a clear reason in the initial strict subset, or retain them once in a deterministic per-page appendix with an unmistakable synthetic label and explicit coverage provenance. An appendix would preserve content but would not claim its logical placement among tagged stories. It requires fixtures for ordering, duplicates, separators, collision with authored labels, and artifact counts within the metadata cap. Arbitrary unmarked text still cannot be silently appended or discarded. The current derived artifact fixture replaces a referenced content block and therefore also has a dangling structure reference; it does not establish handling of a valid standalone artifact. No artifact policy is approved by this planning document.

## Provenance and compatibility

Propose a new PDF projection version 4 with `order:'tagged-structure'`, `orderVersion:1`, existing `kind/engine/engineVersion/scope/pages/emptyPages`, and a new exact exclusion list describing page-local tagged ordering and unresolved fidelity limits. Keep version 1 document metadata, version 2 page-rows, and version 3 page-columns byte-for-byte compatible. Do not reinterpret old `document` as tagged order.

If qualification requires additional coverage metadata, specify its exact bounded schema before implementation. Prefer compact aggregate counts or a fixed coverage policy over an unbounded per-item map. Standalone Node has an 8,192-byte metadata cap; new provenance must fit it without truncation. Validators must reject unknown versions, mismatched order/version pairs, unknown fields and inconsistent coverage counts. No paths, object handles or native write authority belong in provenance.

The same exclusion constants currently exist in extraction core and document validator; keep them synchronized through direct cross-validator tests or a deliberately shared packaged module. Browser/native/Node outputs for identical bytes and policy must agree exactly.

## Applied policy, drafts and native commit consistency

Scope changes are opt-in operations, not immediate relabeling of an existing projection. Selecting an order may set a pending request, but saving a session must record the **committed** projection's order until confirmed re-extraction succeeds. The pre-existing two-way pending-selector issue was fixed in source during this investigation: `sessionData()` now saves the committed PDF order and browser/native restoration normalizes valid legacy preference mismatches from validated projection metadata. Invalid settings still reject; missing native maps retain the legacy shape. This fix shipped in 2.215.0 with browser, native, both Mac package, asset and installation checks passing. Existing v2/v3 documents must remain readable; do not create invalid sessions merely because a user browsed another option or cancelled re-extraction.

Use the common two-way `reextractDocument` / `lockedDocumentRead` transaction introduced with DOCX related text. It locks the body **and open modal dialogs**, blocks menu/history and keyboard/beforeinput/cancel routes, and restores inert/focus state in `finally`. Native reload commits before its IPC result returns; removing this lock without a native staged-read/commit protocol reintroduces native/renderer projection divergence. New controls and entry points must not bypass the lock.

For three-way merges, capture immutable source, options and request state; reject results from superseded reads, edits or session switches. Test all three sides and cancellation, not only default left/right. If a pending selection is stored separately, do not accidentally persist it as committed provenance. Existing saved source drafts must survive reopening; extraction validates original bytes and policy, not permission to overwrite drafts.

Use existing document-save protection for direct paths, renames, aliases/hardlinks, cross-window identities, archive children and remote paths. Exports remain separately named text files. New order/provenance never authorizes PDF rewrite.

## Independent evidence and acceptance gates

The independent fixture agent should produce a tagged PDF through an external producer and record its name/version/options. Inspect it with a separate PDF parser/tool; expected text and tag order must be authored independently of the prototype. Synthetic or patched PDF dictionaries are valuable malformed/edge fixtures but must be identified as derived, not producer conformance evidence.

Required fixtures include same structure/text with different drawing order; same drawing content with different tag order; headings/paragraphs/inline spans; multiple columns and tables; repeated fragments; Unicode/ligatures/RTL; multiple pages and continued structures; Form XObjects; artifact and untagged text; missing/duplicate/ambiguous IDs; object references; ActualText; empty and untagged pages; malicious depth/counts and cancellation. Show exactly which are admitted, which are rejected, and why. A successful PDF viewer opening is not proof that the extractor's logical order is correct.

Release gates:

- Pure mapping tests and real browser/Node PDF.js tests establish exact output, complete text accounting, limits, mutation snapshots and error classification.
- Existing document/row/column policies retain all current output and provenance tests, including external CMap/font resources and independent geometric-order fixtures.
- Browser two-way and merge tests exercise explicit opt-in, unchanged default, pending selection, cancel/success/failure, stale requests, history/drafts, tabs, swap, session restore and source-required limitations.
- Native delayed-read tests use real IPC: policy transition, real typing/selects/menu Undo/Copy, native Cut/Paste, failure unlock, subsequent default reload and saved session all retain matching content/provenance. Keep source/alias/save protection tests.
- Actual CLI subprocess and batch reviewed-plan tests prove protocol byte 3, strict unknown-byte rejection, unsupported-file errors, mixed text/PDF inputs, provenance, output atomicity and cancellation.
- Direct/shell/folder/archive and three-way routes, both Mac packages, final web bundle, source maps and Node helper resources must be checked. Windows runtime remains separately deferred; static Windows packaging is not runtime acceptance. Public signing/notarization is also separate.

## Feasibility evidence available at planning time

`test/fixtures/pdf-tagged-independent/` now contains original LibreOfficeDev 26.8.0.0.alpha0 tagged and untagged exports, independent authored expectations, and pypdf 6.10.0 structure inspection. The one-page producer fixture covers a heading, two columns, Café/Ω text and final paragraph; its tree is Document/H1/section/P with six content IDs. The derived drawing-row-major fixture changes content execution order while retaining tag order. The fixture agent reports identical Poppler-rendered PPM bytes for baseline and drawing-row-major; the producer README records the hash and methodology. These are concrete prototype inputs, not completed extractor acceptance.

Derived duplicate-ID, unmarked-text and artifact-text fixtures probe ambiguity and incomplete coverage. They are labelled separately from real producer output. Nested marked content, repeated Form XObjects, ActualText, tagged links/tables/figures, multipage structures and other PDF producers remain unqualified. Obtain prototype output and refusal classifications before promoting any of them to supported behavior.

The test-only engine prototype now matches structure IDs to marked-content IDs for the real baseline and visually identical drawing-row-major fixture. It rejects the untagged, duplicate-MCID, unmarked-text and artifact-text controls. This demonstrates a useful simple paragraph subset, not general coverage. The prototype also found drawing-order-dependent synthetic spaces at paragraph edges; output must use a specified structural boundary normalization so equivalent tag content does not differ merely from execution order. The prototype uses paragraph `.trim()`, which can also erase authored leading/trailing whitespace; this must not become production behavior under an exact-text claim. Either prove which standalone geometry-boundary space items are synthetic and remove only those, or explicitly define paragraph-edge normalization as part of this opt-in policy, its versioned provenance and user-visible limitations. Preserve internal whitespace according to the documented policy, and add authored edge-space fixtures demonstrating exactly what is retained or normalized. Prototype log: `/private/tmp/fc-pdf-tagged-prototype.log`.

Two unresolved API limitations are material: the exposed representation loses stream (`Stm`) identity, and alternative/ActualText metadata is collapsed. A successful ID match alone therefore cannot establish safe reuse of Form XObjects or faithful accessibility replacement text. The proposed policy concerns text exposed by the engine arranged by supported tags; it must not claim complete accessible text reconstruction. Prototype role/alternative-text guards are test-only. Broader roles, lists and tables require independent separator/coverage qualification before admission, and ambiguous stream reuse must be detectable or remain a feasibility blocker.

Official API reference: [PDF.js API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html) and [PDFPageProxy](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html). The public API exposes a page structure tree and marked-content text extraction; that supports investigating page-local association, not asserting complete logical-document reconstruction. The installed 6.2.108 declarations remain the implementation-specific reference when the draft documentation changes.

## Decision gate

Proceed to implementation only after the engine prototype and independent fixtures demonstrate a useful admitted class with complete text accounting. If PDF.js cannot expose enough information to distinguish safe association from omission, do not ship a misleading mode; record the unsupported cases and choose a different milestone or a separately reviewed parser extension. No dependency upgrade, resource-fetch expansion or document rendering should be smuggled into this ordering feature.

## Additional policy evidence (2026-10-23; test-only)

`test/pdf-tagged-policy-prototype.cjs` passed against the independently produced table/list document and labelled derivative controls. A practical candidate uses tabs between cells, newlines between rows/list items, and a space between a list label and body. It preserves nonempty artifact text once in a labelled per-page tail in drawing order; this describes retained text with relocated presentation, not a claim of logical artifact placement. A valid standalone artifact succeeds, while a dangling reference still rejects. Duplicate content identities and reused Form MCIDs reject.

Authored edge-space derivatives (`derive-policy.py`) contain real leading/trailing spaces independently recovered by pypdf; PDF.js omits those spaces before the ordering function receives them. Thus item height alone cannot justify an exact-authored-whitespace claim. Any release policy must explicitly describe normalization of extracted text boundaries and retain internal extracted whitespace according to its documented rule. Existing comparison defaults stay unchanged.

This is candidate behavior, not a shipped feature or approval of every PDF structure. Empty/missing table cells, row/column spans, nested tables/lists, unknown roles, inline spans, mixed orientation/direction, chunk boundaries and cumulative limits still require fixtures and a final algorithm. Page order remains physical page order. Log: `/private/tmp/fc-pdf-tagged-policy-prototype.log`.

## Current source acceptance (2026-10-23)

Production implementation uses strict v4 provenance with page-local structure ordering and physical page order. Extracted paragraph boundaries are normalized; artifacts are retained once in a labelled per-page tail in drawing order. Uncovered nonempty text, duplicate identities and ambiguous coverage reject atomically. Empty structural cells omitted upstream, cell spans, original layout and accessibility replacement text are not reconstructed. This is not general PDF fidelity or global logical-document reconstruction.

Engine and independent producer/derived fixtures passed, including empty-cell separators, inline text, nested lists, artifact retention, ambiguous references and bounded work. Actual Node CLI and batch tests passed, including protocol byte 3, rejected unknown bytes, reviewed-plan binding and strict provenance. Browser tests and native two-way/three-way tests passed for applied-order persistence, drafts, cancellation and original/alias protection. Existing native archive PDF regression passed. Final combined regression results are recorded in implementation-plan.json; release packaging, static audits, download checks, Apple Silicon acceptance and installation passed; Intel native PDF, merge and shell checks also passed.

Testing also found an independent folder-copy timestamp rounding defect. Directory finalization now preserves fractional timestamps through the verified file handle, with unchanged identity guards and verification tolerance. The focused directory and recursive authority suites passed 35 tests.
