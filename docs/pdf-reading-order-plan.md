# PDF position-based text order: implementation and acceptance

Source implementation adds an explicit Page rows policy. Document order remains the default. This feature shipped and is installed in 2.206.0; both Mac packages passed runtime acceptance.

## Reproduced fidelity problem

Independent ReportLab 4.4.9 PDFs were generated in memory with identical page coordinates and strings: Left top at (60,700), Right top at (310,700), Left bottom at (60,680), Right bottom at (310,680). Only the order of the four drawString calls differed. Default real Node extraction returned:

- Row-major drawing: `Left top Right top\nLeft bottom Right bottom`.
- Column-major drawing: `Left top\nLeft bottom\nRight top\nRight bottom`.

Thus identical visible text can create comparison differences when a PDF producer changes drawing order. `src/pdf-text-core.mjs` retains streamed item strings and `hasEOL` under the default Document order policy. The existing synthetic column fixture tests only one drawing order.

## Narrow, explicit feature

Add a user-selected **Page rows** order alongside **Document order** (the current default). Page rows means top-to-bottom lines, then left-to-right items within each line. It must not claim to infer human reading order for newspaper columns, tables, RTL or vertical text. Preserve document order as the fallback choice for those inputs.

Keep this a versioned extraction policy, not a comparison-only whitespace rule. Reopening a source with a different policy must visibly replace its projection only after successful extraction and invalidate comparison caches. It must not reorder an already edited draft or silently reinterpret a saved session.

## Implementation boundaries

1. Add a pure bounded page-item ordering module called by `src/pdf-text-core.mjs`. Use viewport-normalized coordinates and actual item direction/transform/height; group baselines with an explicitly tested tolerance, sort stably by position, and insert line/word separators from geometric gaps. Ignore stream-order `hasEOL` when grouping reordered rows. Never delete or duplicate nonempty items. Bound items and text bytes before buffering, retain global limits, and check cancellation while processing.
2. Scope the first implementation to horizontal LTR text with finite geometry after page rotation normalization. Reject an explicitly requested unsupported policy/input combination with a useful error, rather than silently returning a different order. Avoid heuristic column segmentation and preserve an available Document order retry. Tests must include mixed font sizes, overlapping items, rotation, skew, blank pages and ambiguous geometry.
3. Thread a validated policy through `src/pdf-text-browser.js`, `src/pdf-text-service-entry.js`, `desktop/pdf-text-preload.cjs`, `desktop/pdf-text-service.cjs`, `src/pdf-text-node.cjs` and its fixed child protocol. Only an enumerated policy crosses boundaries; resource paths stay application-owned. Retain timeout, termination and source-size limits.
4. Connect `src/text-input.cjs`, native `desktop/window-runtime.cjs` and ordinary/merge/archive/folder input routes consistently. Add per-side input settings where reopening is possible; CLI/batch should use the same policy names. Do not leave folder/remote/archive opens silently ignoring a chosen setting.

## Session and provenance compatibility

`src/document-projection.cjs` currently requires an exact version-1 field set and exact exclusions. Keep accepting and emitting that shape for legacy Document order sessions. Introduce an explicit version-2 PDF projection for the new policy with an enumerated order and ordering algorithm version. Do not mutate version-1 saved projections or reinterpret their stored text.

Persist requested input order separately from the actual extraction provenance, as with requested input encoding. Validate both in `desktop/sessions.cjs` and renderer restoration; unknown policy/algorithm versions fail clearly. Reports should include actual extraction policy. Source protections remain keyed by original file/path/identity and must survive v2 session restoration. Update exclusion wording only in the new version: page layout is still discarded and row order does not imply visual equivalence.

## Independent acceptance fixtures

Retain a ReportLab generator and PDFs for the identical-coordinate/different-stream-order pair above. Document order should retain its current distinct outputs; Page rows should produce equal expected text for both. Include a genuinely different word at the same coordinates to prove normalization does not suppress real changes. Add separate page-rotation and mixed-baseline controls and an unsupported-direction case.

Verify pure ordering, actual Node and browser extraction, packaged desktop import/edit/export/session reopening, selected-policy persistence, cancellation and failed-reopen atomicity. Assert original PDF/archive bytes remain unchanged. PDF engine updates must rerun these independent fixtures.

## External CMap qualification now retained

`test/fixtures/pdf-external-cmap` contains an independent ReportLab Japanese CID PDF without embedded ToUnicode. Real Node/browser regressions verify both predefined CMaps are requested, either missing map rejects, recovery works and originals remain unchanged. This addresses an evidence gap in bundled-resource loading; it is separate from the reading-order feature above.

## Source implementation scope

The shared core, browser worker, isolated native service and Node child transport implement both policies with validated provenance. Text options expose a per-side policy and explicit Re-extract action. CLI and batch policy syntax is documented in [PDF-ORDER-CLI.md](PDF-ORDER-CLI.md). Session preferences are separate from actual projection metadata, so changing the next-read preference does not relabel existing text.

Re-extraction requires an available source: a local native path or retained browser File. Saved browser sessions retain text and provenance, not the source File; they require reopening the PDF. Pathless native provider snapshots likewise cannot be re-extracted without reopening. Browser archive PDF entries retain an ephemeral File for this action; PDF writeback remains prohibited. Initial native folder/shell/provider imports retain Document order, with local sources re-extractable from Text options. Three-way text merge document extraction is outside this feature and remains pending.

Page rows supports horizontal left-to-right text after display rotation normalization. It rejects unsupported direction, skew, overlapping ink and ambiguous geometry. It does not infer multi-column or table reading order, evaluate visual layout, or perform OCR.

Source acceptance: full suite passed 2,412 tests with one skip and no failures. Final rebuilt desktop ordering, existing browser PDF editing/export, external-CMap browser, independent fixture/browser archive and session/source-protection checks passed. Package and installed-release acceptance passed for 2.206.0; Windows runtime remains deferred.
