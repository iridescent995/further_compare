# Genuine Node PDF engine feasibility

2026-10-22. Historical feasibility evidence followed by the current **2.195.0 implementation** below. Version 2.195.0 is installed; standalone Node verification refers to the repository on this Mac. The initial spike itself did not change production behavior.

## Verified environment and outcome

Node24.11.0, macOS ARM64; installed `pdfjs-dist`6.2.108 and genuine `@napi-rs/canvas`1.0.13. The legacy PDF.js module obtains DOMMatrix/Path2D from the real optional canvas dependency; this harness adds no fake DOM globals, launches no Electron/browser and renders no pages.

`node test/pdf-node-engine-spike.cjs` passed terminal0 handle42710. Log: `/private/tmp/fc-pdf-node-spike.log`. Every extraction resolves only after the child `close` event, including error, timeout and abort. All child/test processes are terminal.

- Actual two-page Unicode fixture returns exactly `Ω中🚀\n\nΩ中🚀`, matching browser/Electron output.
- A valid image-only PDF rejects with no extractable text; no OCR.
- Invalid PDF rejects; the official password-protected fixture rejects with PasswordException.
- A deliberately unavailable standard-font resource latches an error and rejects even if PDF.js catches the resource error internally.
- A deliberately noncooperative child loop is killed on deadline and external AbortSignal, then reaped. A subsequent real extraction succeeds.
- Network entry points are trapped in the test process (HTTP(S), sockets/TLS and fetch); successful extraction records zero network attempts. Resource reads use only the package's actual cmaps/standard_fonts directories after realpath containment checks.

The encrypted fixture is downloaded upstream test data at `/private/tmp/fc-pdf-engine-spike/encrypted.pdf`; this spike is not part of the ordinary unit runner. A production regression must retain a reproducible licensed fixture or generated encrypted fixture instead of relying on this temporary path.

## Transport and isolation demonstrated

Parent sends a 4-byte big-endian input length followed by raw PDF bytes over stdin; cap32MiB. No paths, PDF bytes, base64 payloads or shell expressions in argv/environment. Parent starts exactly its current Node executable with the fixed child module, no shell, and removes NODE_OPTIONS for the child. The child parses only after stdin closes and requires exact frame length.

Output is an 8-byte header (metadata byte length, UTF8 text byte length), then <=8192-byte JSON metadata and <=8MiB raw UTF8 text. This avoids JSON escape amplification of the text. Parent caps total bytes, requires exact lengths, rejects nonzero child exit and settles on `close`. Engine console chatter is suppressed in the harness; stderr is separately capped16KiB. Production should retain bounded useful diagnostics outside the framed stdout and normalize codes without exposing stack traces.

Parent deadline and abort use SIGKILL, wait for close and clear handlers/timers. PDF.js's Node PDFWorker may use its in-process message handler; the OS child is the actual termination boundary. This is not an OS sandbox or strict RSS ceiling. Current spike parent snapshots/copies bounded buffers; production should reduce unnecessary concatenations and validate UTF8 decoding strictly.

## Dependency/platform constraints

Installed package metadata: PDF.js Apache-2.0 and Node >=22.13.0 or >=24; canvas MIT and Node >=10 (the stricter PDF.js requirement governs). PDF.js declares canvas ^1.0.0 optional. Its optional binary must actually be installed; omission or unsupported ABI should produce DOCUMENT_ENGINE_UNAVAILABLE only when PDF is requested.

Canvas1.0.13 ships optional binary package entries for macOS x64/ARM64, Windows x64/ARM64 MSVC, Linux x64 GNU/musl, Linux ARM64 GNU/musl, ARM GNU, riscv64 GNU and Android ARM64. Package availability is not runtime verification. Only macOS ARM64/Node24 was exercised here. The [upstream canvas support documentation](https://github.com/Brooooooklyn/canvas#support-matrix) states glibc>=2.18 for its GNU build and Apple M support. Windows runtime remains explicitly deferred; do not infer success there from this spike.

Production choice: pin compatible engine/canvas versions for the Node CLI distribution or document/test the optional dependency contract. Keep the existing native desktop renderer adapter independent of this native addon; Electron packaged PDF already works without canvas. Plain-text/DOCX CLI startup should not import either PDF dependency.

## Historical extraction design (now implemented below)

`src/pdf-text-extractor.js` already owns correct page/item/output limits, page separators, exclusions, password/no-text handling and resource failure latch. The only browser-bound component in its extraction loop is the XHR resource reader. Add an optional trusted `readBinaryResource({kind,filename})` callback; the default remains the current bounded XHR reader. A shared wrapper validates resource kinds/filenames, catches and latches errors regardless of adapter, so neither engine can silently publish degraded text. The Node child injects a fixed-package-root filesystem reader with realpath containment and bounded descriptor reads. Never accept caller-supplied arbitrary filesystem/URL roots from CLI or batch JSON.

Run the same extraction function in the child with the actual PDF.js module and a real PDFWorker instance (its Node internal implementation is acceptable inside a terminable child). Preserve strict `document-projection.cjs` validation in both child and parent. Return existing `{content,projection}` rather than the spike's diagnostic-only metadata. Do not maintain the duplicated loop in `test/fixtures/pdf-node-spike/child.cjs` as production code.

Suggested lazy production API: `extractPdfTextInNode(bytes,{signal})` in a dedicated Node adapter module. The CLI owner wires it only when no trusted desktop adapter was supplied; ordinary text/DOCX paths must not spawn a child. Sequential batch use needs no additional parser pool. Bound pending calls if the public adapter can be used concurrently.

## Validation checklist from the spike

Production transport tests: short/extra frames, declared oversized metadata/text, invalid UTF8/JSON/projection, child spawn failure/crash, partial stdin, abort before/during startup/output, and retained listener/child checks. Exercise actual CJK predefined CMap fixtures, partial-empty pages and missing fonts/CMaps, not only synthetic ToUnicode mapping. Verify CLI JSON/text/HTML projection parity, original bytes, explicit encoding rejection, cancellation before report publication, and success of non-PDF modes when dependencies are absent. No release readiness claim from the spike alone.

## Production implementation follow-on

The Node adapter is now `src/pdf-text-node.cjs`, with fixed child `src/pdf-text-node-child.cjs`. It reuses `src/pdf-text-core.mjs`; existing browser import path reexports that core. `readBinaryResource` is trusted runtime injection, and its failures retain the same extraction latch. The parent validates strict UTF8, exact frame bounds and document metadata and resolves only after child close. One extraction per process is allowed; concurrent calls fail explicitly. Missing dependency errors are PDF-specific and lazy. Existing desktop adapter remains independent of native canvas.

Focused production tests: `test/pdf-text-node.test.cjs`, `test/pdf-text-extractor.test.cjs`, `test/pdf-text-service.test.cjs`; 12 pass in `/private/tmp/fc-pdf-node-production.log`. Cases include genuine extraction/image-only/malformed/cancellation/recovery, malformed UTF8/frame lengths, stdout/stderr bounds, spawn failure, concurrency, deadline/reap, and injected resource errors swallowed by engine. Actual password fixture additionally returned DOCUMENT_PASSWORD_REQUIRED. Actual CLI end-to-end tests now pass as described below. Rebuilt browser/desktop regressions and release acceptance remain separately evidenced; these tests alone do not mark release complete.

## Actual CLI integration acceptance — 2.195.0

`scripts/compare.cjs` selects `extractPdfTextInNode(bytes,{signal})` lazily only for PDF text inputs without an injected adapter. Batches forward trusted adapters/signals separately from JSON jobs. Native desktop batches continue to use the sandboxed renderer adapter and never import the Node canvas backend. The normal repository Node 24 dependency installation includes PDF.js and its optional canvas dependency; unsupported/missing native addon availability fails explicitly for PDF without breaking plain text or DOCX.

`test/document-cli-node.test.cjs` runs actual subprocess commands for Unicode two-page PDF/PDF, PDF/text and PDF/DOCX, JSON/text/HTML output, image-only and malformed rejection, continued batch execution and original byte preservation. A deliberately unavailable Node backend leaves ordinary text/DOCX and PDF dry-run operational. `test/document-cli.test.cjs` separately tests injected adapters, source mutation, document encoding/bounds, subprocess signals and report publication races. The combined CLI/batch regression passed 40/40 tests, terminal 0, `/private/tmp/fc-document-cli-final.log`. Injected tests are not substituted for genuine-engine acceptance.

Reports carry strict projection metadata and extracted-text semantics; they do not claim layout or byte equality. Exclusive report publication verifies directory ancestry, source snapshots, exact report bytes and final path/descriptor identity. Cancellation retains already completed reports and prevents later batch work. These changes shipped in 2.195.0. Windows runtime and broader real-world reading-order/CMap coverage remain separate gates. Node runtime verification covers this Mac; packaged desktop extraction continues to use its native renderer adapter.

Source verification update: the CLI symlink boundary was restored without changing desktop picker behavior. Both initial symlink endpoints and endpoints replaced by symlinks during conversion are rejected. The combined snapshot/CLI/batch run passed **43/43**, terminal 0, `/private/tmp/fc-cli-symlink-final.log`. Native source acceptance also passed terminal 0: `/private/tmp/fc-document-batch-final-source.log` (real PDF/DOCX adapters, preview without extraction, malformed-input continuation, Stop, retained reports and unchanged originals) and `/private/tmp/fc-batch-final-source.log` (existing batch workflow). These source checks are supplemented by the 2.195.0 release acceptance below.

Release acceptance (2.195.0): full source suite passed 2,166 tests with one skip and no failures. All six Mac ARM64/Intel runs passed: document batch, existing batch and PDF workflows. The Intel harness initially used an insufficient five-second readiness timeout; its test-only timeout was raised to 60 seconds and the final run passed. Package source/dependency audits, signatures, ZIP contents and downloads passed. The release was installed with the prior 2.194.0 app backed up, and Finder/Services integration remained healthy. Standalone Node CLI verification is repository-based on this Mac; Windows runtime testing remains deferred. Installed startup smoke also passed terminal 0 (`/private/tmp/fc-2.195-installed-smoke.log`): desktop bridge available, Node isolation enabled and sample comparison produced two changes.
