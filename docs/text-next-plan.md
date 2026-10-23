# Confirmed next text capability: PDF text projection

> Historical plan, superseded by releases 2.194–2.199. PDF projection and document CLI/batch integration are implemented; RTF projection is installed in 2.199. The “actual implementation gap” below describes the pre-implementation state and is not a current backlog. See `implementation-plan.json` → `currentRemainingPriorities` and `docs/rtf-text-projection.md` for current evidence and remaining scope.

Assessment date: 2026-10-22. Planning only; no implementation, dependency installation or parity completion claim.

## Why this belongs in the requested scope

The user requested the full reference product, explicitly including other comparison types. The vendor's primary [document comparison knowledge-base article](https://www.scootersoftware.com/kb/docxlspdf) documents PDF conversion to plain text for a read-only Text Compare session. Its [file format documentation](https://www.scootersoftware.com/v5help/file_formats.html) describes conversion as part of file-format handling. Thus PDF text projection is an evidenced missing capability, unlike the earlier moved-block suggestion, which was not established as reference parity and is not proposed for implementation here.

The milestone is comparison of extracted PDF text. It does not claim pixel/layout comparison, PDF editing or OCR. The vendor also describes image-only PDFs lacking convertible text in its [official support explanation](https://forum.scootersoftware.com/forum/beyond-compare-3-discussion/other-session-types/6032-conversion-error-with-pdf-plugin). Extraction ordering and line breaks require disclosed limitations, not promises of identical conversion output across products.

## Actual implementation gap

- `src/text-input.cjs` recognizes only `.docx` as a document projection; other input goes directly through ordinary text decoding. No PDF extraction pathway exists there.
- `src/docx-text.cjs` supplies DOCX-specific extraction and strict projection metadata validation. `desktop/sessions.cjs` currently imports this DOCX validator for `documentProjection`.
- `src/app.js` routes file loading through `decodeTextInput` but has DOCX-specific input limits, suggested text export naming and projection handling. These need generalization rather than a parallel viewer.
- `desktop/window-runtime.cjs` uses the same decoder and guards original projected sources on save. This is reusable infrastructure, but PDF recognition and validated metadata must reach every applicable route.
- `implementation-plan.json` retains broad rich-document conversion in Text editing. The later `docxTextProjection2188` entry already delivers main-document DOCX extraction and protection; DOCX must remain counted as completed within its stated scope.

Missing user workflow: select two PDFs directly, through a folder/archive child, or through shell comparison and read their textual differences in the existing compact Text Compare editor. Unsupported PDF bytes currently have no conversion step, so this workflow is not equivalent to the implemented DOCX pathway.

## Feasible first slice

1. Select and pin a maintained PDF text extraction engine usable in both the browser and Electron. A short technical spike must verify its module/worker packaging, Unicode extraction, license, security options and cancellation against the actual build; do not assume a machine-installed utility exists on Windows. Evaluate a bundled JavaScript engine first to avoid platform-specific converter binaries. No new engine is selected or installed by this plan.
2. Add a bounded `extractPdfText(bytes)` worker pipeline: conservative input/page/output/work limits, explicit cancellation, deterministic page separators and a documented text-item ordering policy. Do not execute PDF JavaScript, follow links, fetch external resources or render annotations as executable content. Refuse encrypted/password-required documents explicitly in this first slice. Distinguish empty/image-only documents from successful comparable text; never label two failed or empty extractions “identical”.
3. Generalize the existing validated projection union with `kind:'pdf'`, schema/version, extraction engine/version, page count, coverage and exclusions. Retain source identity and original bytes where existing sessions need them. Publish both new input content and metadata atomically; extraction errors leave the previous comparison intact.
4. Route native Open, drop, shell, folder, archive and web file inputs through the shared decoder. Audit SFTP child dispatch separately for consistent input limits and conversion availability; do not silently treat PDF as raw text there. Show “PDF extracted text” and limitations in the existing workspace. Source remains read-only; editable extracted drafts, if permitted like DOCX, export explicitly as `.txt` only.
5. Extend existing original-source save guards to PDF across windows and hardlink aliases. Disable PDF archive/remote writeback and PDF output destinations for extracted drafts. Preserve provenance across swap, tabs, saved sessions, reload and reports. Reuse the compact editor and existing selected-line copy/undo behavior; no new standalone compare screen.

## Validation before completion

- Engine fixtures: Unicode/fonts, paragraphs, multiple pages, line-break ordering, rotation/columns with explicit policy, empty/image-only input, encrypted files, malformed/truncated PDF, oversized page/output and cancellation. Test local fixtures without external requests.
- Browser: open both PDFs, compare selected text, edit/undo, wrap, swap, save text, session restore, stale extraction rejection and failed-open state preservation.
- Native: direct/folder/archive/shell opening; cross-window original/hardlink overwrite rejection; successful `.txt` export; unchanged original bytes. SFTP route tested with an injected/local fixture provider if supported in the milestone.
- Regression: DOCX browser/native suites, ordinary encodings/BOM preservation, selected-line copy/history, archive original protection and session validation.
- Release: both Mac packaged apps plus web bundled extraction/worker loading. Windows source/package checks separately; actual Windows execution remains deferred by the user and must not be reported as verified.

## Remaining separate scope

RTF/ODT/legacy DOC conversion, OCR, layout comparison, user-configured arbitrary conversion commands, broader AST alignment and extra legacy codecs remain separate projects. The earlier moved-block idea is an optional enhancement without verified parity evidence, not part of this plan or a new accepted requirement. Existing arrow/selection/undo/wrap/grammar work remains completed subject to its recorded tests; this plan does not reopen those tasks.
