# PDF.js extraction spike

2026-10-22. Isolated feasibility test only; no package.json, lockfile or application routing changes.

## Evidence

Official `pdfjs-dist@6.2.108` package downloaded to `/private/tmp/fc-pdf-engine-spike/package`. Package metadata: Apache-2.0, ESM `build/pdf.mjs`, Node `>=22.13.0 || >=24`, optional native dependency `@napi-rs/canvas ^1.0.0`. Current command-line Node is24.11.0; application uses Electron42. The downloaded package is not a project dependency.

`test/pdf-engine-spike.cjs` ran in isolated headless Chrome. Terminal0, handle74144; `/private/tmp/fc-pdf-engine-spike/browser.log`:

- Generated valid two-page PDF with ToUnicode font map extracted `Ω中🚀` on each page.
- Generated empty two-page PDF produced two empty strings: engine success is not proof of comparable content.
- Malformed bytes rejected with InvalidPDFException.
- Official password-protected fixture `test/pdfs/issue6010_1.pdf` rejected without password with PasswordException. Its source is the [official PDF.js fixture](https://github.com/mozilla/pdf.js/blob/master/test/pdfs/issue6010_1.pdf), identified through the upstream test manifest. It lives in the temporary folder only.
- Test request interception allowed only the controlled module origin. No external requests were observed for these fixtures. Loading task destroyed after every case; browser closed in finally. No tests remain live.

Initial restricted browser launch failed due to sandbox process access; the same test passed with authorized process execution. No user browser profile or documents were used.

## Dependency and integration proposal

PDF.js is viable for extraction in Chromium/Electron renderer with packaged `build/pdf.mjs` and matching `pdf.worker.mjs`. Official [examples](https://mozilla.github.io/pdf.js/examples/) document browser and Node entry points. Its [API source](https://github.com/mozilla/pdf.js/blob/master/src/display/api.js) defines byte-array loading, text streams, task destruction and parsing controls. Use the pinned version's installed API declarations when implementing; do not mix future upstream API signatures with this release.

Propose exact dependency `pdfjs-dist: 6.2.108`, subject to completing native backend feasibility. This is not yet an approved production dependency decision. Keep matching worker version and license; serve from packaged/local URLs, never a CDN. Existing build emits classic IIFE workers (`scripts/build.mjs`), so simply importing PDF.js into that bundle is insufficient: copy/bundle its ESM module worker separately and provide an explicit source URL with CSP-compatible worker policy.

**Native backend issue:** direct import of `legacy/build/pdf.mjs` on Node24 without optional canvas failed at module initialization (`DOMMatrix is not defined`). Optional `@napi-rs/canvas` is not installed in the isolated package. The main-process `decodeTextInput` cannot simply import PDF.js and assume text extraction has no DOM dependency. Do not use a fake DOMMatrix stub to hide this.

Next technical gate: prove a bounded Node worker extraction adapter with supported canvas/polyfill dependency, or a dedicated isolated Electron renderer extraction service. Node workers with the real supported canvas package preserve the shared CJS decoder contract but add architecture-specific native assets and packaging tests. A renderer service avoids native canvas but requires async conversion bridge design for session staging, folder/provider reads and web parity. Choose explicitly before editing shared routes. Browser-only success is not Node/Electron packaged support.

## Required bounds and security design

Supply copied Uint8Array bytes, not arbitrary document URLs (PDF.js transfers ownership). Set `stopAtErrors:true`, disable eval/font-face/system-font/XFA/WASM paths where compatible; never call rendering, scripting, attachment execution or external-link APIs. These settings and fixture interception are not a proof against every resource fetch: packaged CMap/standard-font resolution needs an explicit local-only provider and a missing-resource error policy. International documents may require these assets even though the synthetic ToUnicode fixture does not.

Use `streamTextContent` to enforce cumulative item/output limits incrementally; reject excessive page count before traversal. Bound input32MiB, output8MiB and page/item counts initially (proposed limits, not implemented). A promise timeout alone cannot stop a CPU-bound fake-worker parser. Native processing needs a terminable worker/process with a wall-clock timeout; browser processing needs owned real worker termination on cancellation and stale request discard. Always destroy loading tasks and clean pages on success/failure.

Explicitly reject password-required input in the first slice. Empty or image-only pages need coverage metadata and “no extractable text” when all pages are empty. This spike tests blank pages, not a scanned-image PDF; an image-only fixture is still required. No OCR or visual equivalence claim. Text order, columns, rotated text, missing character maps, font assets, resource limits and cancellation remain integration tests, not established by this minimal fixture.

## Reproduction

Download the official6.2.108 tarball, extract under `FC_PDF_SPIKE_ROOT/package`, and place upstream issue6010_1.pdf at `FC_PDF_SPIKE_ROOT/encrypted.pdf`. Then run:

```
FC_PDF_SPIKE_ROOT=/private/tmp/fc-pdf-engine-spike node test/pdf-engine-spike.cjs
```

The script imports project Playwright only; it does not install PDF.js or alter app files. Temporary files are intentionally retained as inspection evidence. Project production dependencies and source routes remain unchanged.

## Follow-on: isolated Electron renderer prototype

`test/pdf-electron-spike.cjs` now exercises installed Electron against a temporary, standalone main script. It does not launch the Further Compare workspace, change production routes, use a user profile, or require optional canvas. A hidden sandboxed BrowserWindow per extraction loads the exact6.2.108 module and matching module worker from local files. Its ephemeral session rejects requests outside the exact entry file/package asset directory, denies permission requests and new windows, blocks later navigation, and has no Node integration or preload/IPC bridge. CSP disallows network connections.

Main-process wall-clock timeout/cancellation destroys the extraction window independently of renderer cooperation. The fixture deliberately enters an infinite renderer loop to prove the main deadline still returns and destroys the window. After timeout and cancellation, a fresh extraction succeeds. This tests service teardown, not merely racing an ignored parsing promise.

Observed results:

- Two pages of Unicode text extracted identically to the browser spike.
- A valid PDF with only an image XObject has zero text items and reports `empty:true`; no OCR attempted.
- Two columns authored in column-major content-stream order produce `Left top`, `Left bottom`, `Right top`, `Right bottom`. This is content extraction behavior, not a promise to infer human reading order for every PDF. Geometric reordering is not implemented.
- Input byte limit, page limit, streamed output byte limit and item count each refuse explicitly.
- Synthetic non-cooperative rendering task times out, explicit cancellation terminates it, and subsequent extraction succeeds.
- Every result reports zero remaining BrowserWindows. Test application closes and temporary application/profile files are removed in finally.

First execution passed terminal0 handle87281; cleaned-source final rerun recorded separately below. Log: `/private/tmp/fc-pdf-engine-spike/electron.log`. The prototype uses test-only `spin` and limit overrides; neither belongs in the production API.

### Minimal production integration proposal

1. Create one app-owned `PdfTextService` after app readiness, exposing `extract(bytes,{signal})`, with bounded concurrency/queue and request-specific window ownership. Production fixed limits, no renderer-supplied asset URLs, and a closed local resource manifest. Clean up on app shutdown and owner-window disposal. Work hidden and do not steal focus. Confirm ephemeral sessions do not grow indefinitely under repeated jobs.
2. Extend `decodeTextInput(bytes,name,encoding,options)` with an injected PDF extraction adapter rather than importing Electron into shared code. Native `stageText` in `desktop/window-runtime.cjs` already awaits this method, so inject the app service there. Browser `loadFile`/archive paths in `src/app.js` use a browser worker adapter. Main `shared` runtime wiring carries the adapter; the renderer cannot request arbitrary filesystem reads from it.
3. `src/app.js:openDataComparison` currently decodes archive/provider bytes locally and treats DOCX conversion failure specially. Expand document recognition, error handling and provenance consistently; do not fall back to binary after a PDF extraction error. Audit native folder/open/shell paths that converge on stageText and remote/provider byte paths independently.
4. Saved text session staging in `desktop/sessions.cjs` validates stored projection metadata/text. Introduce the document-projection tagged union rather than triggering conversion of every saved draft. Preserve saved edits; actual source reload reconverts through the bounded service.
5. Generalize source-protection and projected export naming beyond DOCX as described in text-next-plan. Prototype makes no changes to these safeguards or runtime routes.

### Remaining engineering limits

Renderer isolation plus hard timeout bounds duration, not total resident memory. A small compressed PDF can allocate substantial parser memory before streamed limits are reached. Validate crash handling, renderer process termination and output IPC size; decide whether stricter process memory supervision is needed before shipping. Current prototype transfers bytes/results via executeJavaScript string serialization, adding copies; replace with a bounded transfer/IPC channel before production. Capture decoder error codes instead of Electron's wrapped error strings. Real abort signals, owner closure, concurrent jobs, malformed/encrypted cases in Electron, font/CMap asset resolution, and packaged file/CSP behavior still require focused integration coverage. Matching module-worker extraction is proven in installed Electron, not final packaged Further Compare or Windows runtime.

Cleaned-source final Electron rerun: terminal0 handle35981; all assertions above passed, application closed, no live test handles. No production dependency changes or application build performed.
