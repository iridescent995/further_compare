# Mixed-type file-manager comparison review

Status: implemented and source-verified after release 2.216. Native file-manager requests now offer a comparison-mode review for mixed classifications. Packaged and installed in 2.217.0; both Mac architectures passed mixed-type, selected-pair and URL invocation checks. Windows runtime remains deferred.

## Problem and bounded milestone

The current file-manager dispatcher chooses editors from extensions. `desktop/shell-requests.cjs` classifies each filename in `comparisonType`, then selects Binary Compare whenever the classifications differ. A local temporary-fixture probe confirmed that `left.csv` and `right.txt`, both containing comma-separated text, open Binary Compare. A recognized document paired with a CSV is rejected because the CSV maps to Table Compare, even though its contents can be compared as text.

Add a host-owned **Compare as…** review for mixed classifications. Preserve automatic routing for pairs with the same classification, existing unknown/unknown text detection, single-file Set as Left behavior, and folder comparisons. Do not add a prompt to every invocation. This milestone uses existing native menus and Services, so it does not depend on modern Explorer deployment or signed Finder app groups.

Initial choices should be **Text**, **Binary**, and **Cancel**, filtered by a conservative eligibility policy. Do not advertise specialized comparison choices until both actual parsers can admit both original filenames/containers without renaming, format guessing or losing provenance. In particular, comparing CSV and arbitrary TXT as a table requires a separate delimiter/import review and is not part of the initial milestone. Matching workbook/image/audio/archive pairs retain their existing automatic editors.

Suggested eligibility:

- Text-like extension mismatch, including CSV/TSV versus ordinary text: offer Text and Binary.
- Supported document plus an ordinary text-like file: offer Text and Binary. Text means document extraction plus text decoding, not decoding the document container as bytes.
- Known incompatible binary container combinations: preserve Binary or offer a concise Binary/Cancel review; do not suggest Text as a meaningful document conversion.
- File/folder mismatch remains an error before the new review.

The filename predicate is a decoder eligibility policy, not a claim that unknown files are text. Unclassified filenames paired with eligible text/document inputs may offer explicit Text; the existing strict decoder must admit their bytes, including custom source-code extensions. Known classified binary containers remain excluded. A chosen Text operation that fails must show its error; it must not silently fall back to Binary after the user chose Text.

## Existing integration points

- `desktop/shell-requests.cjs`: `ShellRequests.take`, `comparisonType`, `fileSnapshot`, `verifySnapshots`, and `validateFiles` own dispatch, reads and snapshot checks.
- `desktop/window-runtime.cjs`: the `shell:take` handler already supplies `reviewURL` and `reviewSelection` callbacks through `dialog.showMessageBox`. Add the new review callback here, using the same owning window and literal-path display escaping.
- `src/app.js`: `acceptShellRequest` already creates the returned comparison type and loads its sides. It should continue receiving only completed, validated requests; it must not become a decoder or authorization authority.
- `src/text-input.cjs`: `decodeTextInput` handles plain text and explicit PDF/DOCX/RTF/ODT extraction with validated projection metadata.
- `desktop/document-save-guard.cjs` and the existing runtime source-authority setup must continue protecting original document paths and aliases.

Reuse native `showMessageBox` for the small initial option set. Suggested message: “Choose how to compare these files”; detail shows both escaped full paths and explains “Text compares readable text or extracted document text. Binary compares original bytes.” Use Cancel as the safe default. This is a choice about comparison semantics, not a second approval for a direct shell command.

## Callback and state contract

Extend `take({reviewURL, reviewSelection, reviewComparison})` with an internal callback receiving an immutable descriptor such as `{left:{name,path},right:{name,path},choices:['text-compare','binary-compare']}`. It returns exactly one offered mode or `'cancel'`. Reject unexpected values or missing callbacks for requests that require a choice; do not invent approval. No renderer-provided path, snapshot or mode may bypass this validation. No new URL/CLI parameters are needed.

Processing order:

1. Preserve existing external URL approval **before** resolving paths, reading remembered state or accessing files. A public URL scheme remains untrusted even when it names a valid comparison mode.
2. Resolve the requested file/folder kind and remembered left selection. Preserve selected-pair order review and its inode/canonical-path revalidation.
3. Capture both file snapshots before opening the comparison-type review. Determine the offered choices from the approved paths and bounded classification policy, not from user-controlled executable commands.
4. Await the native comparison review. Cancel returns `{action:'cancelled'}` with no content read, new tab, source authority, remembered-selection mutation or disk write. Reading existing remembered state is allowed and does not authorize changing it.
5. Revalidate both snapshots immediately after the review and before reading bytes. A same-path replacement, symlink change, content revision or type change must reject and require a fresh invocation.
6. Read the original files through existing bounded readers; revalidate after reads. Decode only using the explicitly selected strategy. Preserve byte buffers for Binary and document projection metadata for extracted Text.
7. Revalidate after asynchronous extraction. Return the existing one-use snapshot-backed request; the runtime must still call `validateFiles` immediately before establishing a new session's authority.
8. Retain the existing window/context ownership guards. Closing the owner window or failing a later check must not publish a comparison from an obsolete review.

Do not mutate remembered-left state merely because a pair was compared or a mode chosen. The initial milestone should not change `--fc-set-left`; if single-file review is expanded later, publish its remembered selection only after successful review/read/verification. Existing earlier tabs and unsaved contents remain intact.

## Decoder and source protection rules

Text selection uses `decodeTextInput(bytes, originalName, 'auto', ...)`; retain original filenames so PDF/DOCX/RTF/ODT go through their actual parsers. Preserve the existing input/output limits, cancellation, local-resource restrictions and extractor error codes. This milestone does not introduce an encoding picker, change PDF ordering defaults or opt users into related DOCX text. Those settings retain their current explicit defaults and provenance.

Never rename a container to `.txt` to force parsing. Never retry failed document extraction as ordinary text. Malformed or password-protected documents report the actual extraction error. Explicit Binary compares original bytes; it must not remove original-document protection: native `protectedDataSourceKind(original.path)` and held source identities remain in force for binary source authority.

Do not treat an extension mismatch as evidence of malicious content or require extra platform permissions. The review addresses a practical format ambiguity using already authorized local reads.

## Required tests

Unit and runtime-contract tests:

- CSV/TXT and TSV/TXT offer the specified choices; Text returns decoded text, Binary returns unchanged base64 bytes.
- DOCX/PDF/RTF/ODT plus eligible text use the real extractor and return the correct immutable projection. A malformed document never silently falls back.
- Matching known types and ordinary unknown/unknown text retain current routing; file/folder mismatch still rejects.
- Invalid callback values, omitted required callback and non-offered modes reject before reading content.
- Cancel leaves remembered-left JSON, queue semantics, existing tabs, original bytes and session source authority unchanged.
- Replace, rename, retarget or modify either file while review is pending: reject before decode/publication. Also mutate during asynchronous extraction to exercise the final snapshot check.
- External URL cancellation invokes no filesystem read or remembered-state lookup; new mode review never substitutes for URL approval.
- Selected-pair order swapping is reflected in the later mode review and final result.
- Explicit document Binary keeps original-path/hardlink protection; extracted Text keeps existing document projection/save guards.
- Owning-window closure and competing shell requests cannot apply a stale choice to another request.

Use real independent UTF-8 CSV/TXT fixtures and existing independently produced document fixtures. Test callback sequencing with injected deferred promises, but also run actual packaged Mac file-manager invocation: Compare with Left and Compare Selected, both choices, cancellation, existing unsaved-tab preservation and source-byte hashes. Test Services and native Finder routing without installing new services merely to run a unit test. Windows source/static tests remain required; Windows runtime remains explicitly deferred by the user.

## Completion boundary

This milestone is complete only when the shared dispatcher, native review integration, source-authority checks and Mac acceptance agree. It is not a modern Explorer release, a new encoding feature, a table-import inference feature or full shell parity. Modern Explorer SDK compilation/signing/activation and authorized Finder app-group filename hints remain separate external dependencies.

## Source acceptance

The full suite passed 2,559 tests with one skip and no failures. Production build passed. Actual native second-instance invocation passed Text/Binary/Cancel, document/CSV extraction, malformed document failure without fallback, preserved drafts and remembered selection, and original/hardlink protection. Existing selected-pair and external-URL native regressions also passed. Six native handler contract tests cover escaped literal paths, filtered choices and stale/disposed ownership before publication.

Logs: `/private/tmp/fc-shell-compare-as-full.log`, `/private/tmp/fc-shell-compare-as-build.log`, `/private/tmp/fc-shell-compare-runtime.log`, `/private/tmp/fc-shell-compare-as-desktop.log`, `/private/tmp/fc-shell-compare-as-selected-regression.log`, `/private/tmp/fc-shell-compare-as-url-regression.log`.
