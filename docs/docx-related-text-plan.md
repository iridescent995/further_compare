# DOCX related-text extraction plan

Implementation plan, 2026-10-23. The opt-in policy is implemented and verified in source, browser, CLI/batch and native acceptance. Packaged Mac acceptance and all three asset audits passed; release 2.214.0 is installed with 2.213 retained as backup. Windows runtime remains deferred. This milestone expands text coverage; it does not render Word pagination or edit DOCX packages.

## API and policy

Keep the existing main-body extraction as the default. Proposed API:

```js
extractDocxText(bytes, {DOMParser, scope: 'main-document'})
decodeTextInput(bytes, name, encoding, {docxScope: 'main-document', ...options})
```

The only additional admitted policy is `main-and-related-text`, explicitly selected by the user or script. An absent setting always means `main-document`; recognizing related parts in a file must never enable the new policy automatically. Selecting a policy should not discard an existing draft: use a separate, reviewed re-extraction action with the existing stale-request safeguards.

`src/docx-text.cjs` owns extraction and DOCX metadata validation. It currently follows the root office-document relationship and extracts only its body. Extend this engine, rather than introducing a second converter. Resolve the main part's relationships using its actual canonical path; do not assume `word/document.xml` or fixed related filenames. Admit only internal relationships with the required relationship type, content type, namespace and root element. Reject missing/duplicate relationship IDs, escaping/ambiguous targets, external targets for requested content, invalid XML and unsupported constructs that prevent reliable association. Never fetch links or execute macros/fields.

Retain 32 MiB compressed/64 MiB expanded package admission. Share the existing XML/node/paragraph/output budgets across requested stories, not separately per part; bound relationship/reference counts and traversal before allocating output. Snapshot bytes before asynchronous work. Read every selected part through archive integrity validation. Fail without publishing a new editor state when a requested story cannot be extracted.

## Logical ordering and reference semantics

The policy covers main body, referenced headers/footers, footnotes and endnotes. Comments, drawing/text-box text, equations, numbering computation, linked documents and page layout remain excluded.

Preserve main-body order and existing paragraph/table conventions. Include stable inline note-reference markers and a deterministic note appendix ordered by first surviving reference, separately for footnotes and endnotes. Map package note IDs to encounter ordinals: changing incidental IDs must not create a textual difference, but moving/changing a reference must remain visible. Repeated references share one definition; reject dangling/duplicate definitions. Exclude separator/continuation records by their schema meaning, not by assuming every negative ID is ordinary note content. References in deleted/moved-from content follow the existing revision exclusions. Do not reconstruct displayed note numbering or custom numbering rules; describe markers as logical references.

Represent headers/footers by section and first/even/default variant, in stable labelled related-text sections. Resolve section references and inheritance explicitly, including shared parts and first-section absence. Do not append one copy per rendered page. Retain the association between a section and its effective header/footer even when multiple sections share a part; deduplicate parsing, not meaningful associations. First/even-page activation and inheritance depend on document/section settings: implement and qualify those rules, or report the related text as referenced variants rather than claiming rendered-page usage. Header text stored in an unreferenced part must not silently enter the comparison.

Synthetic labels must be distinguishable in provenance from source content; they are extraction structure, not text originally authored in the document. Define ordering and labels in fixtures before implementation. Do not claim that this logical policy matches Word's page order.

## Provenance and backward compatibility

Leave the exact existing DOCX version-1 `main-document` metadata contract accepted. Emit it unchanged for the default policy so existing sessions/reports remain stable. Introduce a separate version-2 contract for the opt-in policy, containing validated scope/policy version, canonical main part, bounded related-story descriptors/counts, paragraph/table totals and exact exclusions. The metadata must explain covered text without exposing arbitrary executable paths or granting write authority.

`src/document-projection.cjs` already dispatches DOCX metadata to `validateDocumentProjection` in `src/docx-text.cjs`; keep that single validator authoritative. Session settings and stored provenance must agree. A missing setting with old v1 metadata stays main-only. For new v2 metadata, require the matching explicit setting or a documented migration rule that reconstructs it from previously saved provenance; never upgrade old sessions to wider coverage. Reject unknown policy/schema versions rather than treating them as main-only success.

Two-way sessions should add `options.docxScopes:{a,b}` alongside current `pdfOrders`; three-way sessions should add `options.mergeDocxScopes:{base,a,b}` alongside `mergePdfOrders`. Validate strict side maps and allowed values. Save/swap/tab/history behavior must carry the policy with the corresponding source. Source bytes and extracted drafts remain separate; restoring an edited draft must not silently replace it with freshly extracted content.

## Existing option and route entry points

- **Shared decoder:** `src/text-input.cjs:decodeTextInput` currently accepts `pdfOrder` and dispatches DOCX to `extractDocxText`. Validate `docxScope` and pass it to the DOCX branch. Other input formats retain their own behavior.
- **Two-way browser:** `src/app.js` has a positional PDF-order decoder wrapper, `pdfReadOptions`, `reextractPdf`, `sessionData`, `newSession`, session restoration and option event wiring. Generalize the wrapper to a validated options object before adding DOCX scope. Add compact per-side DOCX controls beside existing document-reading controls; default them to main-only. Use the same confirmed replacement, source availability, source revision and late-result checks as PDF re-extraction.
- **Archive/folder/browser child inputs:** `src/app.js:openDataComparison` currently decodes without a document policy. Initial child opening remains main-only. Opt-in re-extraction requires retained immutable original bytes or reopening the source; a projection-only restored draft must ask for the original rather than pretending it can recover related parts.
- **Native reads:** `desktop/window-runtime.cjs:pdfReadOptions`, `stageText`, local `openText`, and the open/path/reload IPC handlers currently pass a PDF-order scalar. Extend the strict options object with DOCX scope and thread it through staging. Reload uses the saved document policy when no override is supplied. Audit `desktop/preload.cjs` option forwarding and preserve the existing IPC argument authority boundaries.
- **Three-way merge:** `src/advanced.js:readMergeInput` passes `mergePdfOrders`; its `changeMergePdfOrder` and `renderMergeReadControls` implement re-extraction and state invalidation. Add the DOCX sibling policy with the same cancellation/generation checks. Successful policy replacement clears affected derived merge output/choices/history; failure leaves the prior draft intact. Cover base as well as left/right.
- **Session schemas:** `desktop/sessions.cjs:validateAdvanced` validates merge document options and their provenance; the ordinary options validator handles `pdfOrders`. Add strict DOCX maps and agreement checks in both. Mirror validation in browser restoration in `src/app.js` and `src/advanced.js`. If reusable defaults are supported, extend their explicit allowlist only after deciding whether a saved user choice should apply to future DOCX sessions; baseline defaults remain main-only.
- **CLI:** `scripts/compare.cjs` has the argument allowlist, PDF policy validation and `decodeTextInput` call. Add `--docx-scope main-document|main-and-related-text` only for text mode. Explicit non-auto byte encoding remains invalid for document projections. Reports include the resulting validated provenance and covered-story meaning.
- **Batch:** `scripts/batch.cjs` has strict job-key validation, `documentConversions` dry-run descriptors and `argvForJob` construction. Add `docxScope` consistently to all three and help text. Dry-run reports selected scope/limits without extracting content. `desktop/batch-service.cjs` must retain the reviewed-plan binding and forward the selected policy through existing jobs, not accept converter code or external resource roots.

## Save protection

Reuse `desktop/document-save-guard.cjs` and `desktop/window-runtime.cjs` original-document tracking, including cross-window source identities, source renames and hardlink aliases. Extracted drafts export separately as text, never as rewritten DOCX. Keep projected archive/server writeback disabled. Changing scope or restoring a session does not grant source-write authority. Browser downloads retain explicit text filenames. Existing exclusive CLI report publication and original snapshots remain unchanged.

## Independent fixtures and release gates

Create documents with an independent producer, preferably LibreOffice UNO for notes/sections plus separately authored Open XML fixtures where producer support is unavailable. Record producer/version and distinguish derived malformed fixtures. Keep expected text/story associations authored independently of the extractor, and inspect parts using a separate ZIP/XML implementation. An office application should open the valid fixtures and confirm intended header/footer/note associations; package XML alone does not prove rendered-page inheritance.

Required pairs include identical body with only a header/footer/note change; multiple sections and inherited/shared parts; first/even/default variants; note ID renumbering with identical meaning; moved/repeated references; separator notes; Unicode/tables; stored fields and revision exclusions. Test absent/malformed related parts, external relationships, target traversal, duplicate IDs, aggregate budget attacks, unknown namespaces, caller mutation and cancellation/late results.

Prove default main-only output is byte-for-byte unchanged for existing fixtures, while the opt-in detects related-text-only differences. Run actual browser and Node CLI/batch extraction, native direct/shell/folder/archive routes, mixed three-way document merge, policy swap/reload/history/session restoration and source/hardlink protection. Qualify both final Mac packages and the web bundle. Windows runtime and public signing remain externally deferred; static package checks do not substitute for runtime evidence.

Primary references: [Microsoft WordprocessingML stories and parts](https://learn.microsoft.com/en-us/office/open-xml/word/structure-of-a-wordprocessingml-document?tabs=cs), [header references and inheritance](https://learn.microsoft.com/en-us/office/open-xml/word/how-to-replace-the-header-in-a-word-processing-document). Verify detailed note and section rules against the applicable Open XML specification during implementation. This plan is not a claim of full Word conversion fidelity.
