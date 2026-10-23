# Next archive milestone: editable compressed drafts

> Historical plan: compressed editable drafts shipped in 2.193, and AES encrypted ZIP read-only comparison shipped in 2.197. The initial recommendations and missing-behavior description below are retained as design history. The current legacy-encryption investigation and acceptance contract are in `docs/archive-zipcrypto-plan.md`; the broader backlog is `implementation-plan.json` → `currentRemainingPriorities`.

Status: implementation plan only, inspected against current source on 2026-10-22. No production changes or packages were made for this plan.

## Recommendation

Make every supported archive edit and child-file writeback capable of producing a bounded compressed ZIP draft. This fixes a concrete gap in existing archive workflows before adding another archive format. Preserve the existing 32 MiB serialized-input/output, 64 MiB expanded-content and 50,000-entry limits.

A valid compressed archive can currently open, compare and export but cannot necessarily accept even a filename change. `src/archive-edit.cjs` always serializes `editArchive()` results through the stored ZIP writer. `prepareIncoming()` also rejects based on projected stored size. A small compressed archive whose contents exceed 32 MiB therefore becomes uneditable despite satisfying all input/content limits. Child text/binary/workbook writeback calls the same edit path (`src/archive-compare.js`, `stageEntryEdit`).

Read-only reproduction against current code created one 33 MiB repeated-byte file with `writeCompressedZipEntries`, opened it using `parseArchiveInput`, and attempted a rename:

```json
{"compressedBytes":33764,"expandedBytes":34603008,"renameError":"Stored ZIP output exceeds 32 MB."}
```

This is a user-visible capability gap, not a request to lift safety bounds or claim exact original compression preservation.

## Already implemented—do not repeat

The `archiveEditing`, `archiveZip64Input`, and Sources and integrations sections of `implementation-plan.json`, checked against source, already cover:

- ZIP/JAR, TAR and TAR.GZ reading and lazy paired trees; bounded ZIP64 input was released in 2.119.0.
- Reviewed in-memory copy/delete/rename, file/folder imports, selected extraction, undo/redo and session restoration.
- Text, binary and supported table/workbook child results applied back to an inactive parent, with stale-source guards and independent archive history.
- Stored/deflated ZIP export, TAR and TAR.GZ export, CRC checks, portable names and known ordinary POSIX permissions.

Original archives are preserved; editing/export reconstructs a new archive. Original ownership, special mode bits, comments, signatures and compression are explicitly not retained. Media-output writeback remains separate unfinished work.

## Why this increment comes first

| Candidate | Assessment |
| --- | --- |
| Compressed editable drafts | Reuses the existing tested raw-deflate writer and closes an observed failure across rename/import/copy/child writeback. Recommended next. |
| ZIP64 output alone | Classic ZIP already accommodates the present limits: fewer than 65,535 entries and far below 4 GiB. Forced ZIP64 under current limits adds little user capacity. Large-file support needs a separate streaming/storage/history design before relaxing limits. |
| Encrypted ZIP | Useful, but requires vetted cryptographic support, independent fixtures, password lifecycle and explicit decrypted-session/export handling. Do not implement ad hoc crypto or imply encrypted input remains protected in saved sessions. |
| 7z/RAR/additional formats | Requires a bounded dependency/runtime and cross-platform packaging review. No current engine supports these formats. |
| Exact metadata/compressed-payload preservation | Valuable follow-on, but needs parser provenance and an immutable entry graph rather than extending the current reconstructed ZIP snapshot model casually. |

## Proposed implementation contract

1. Add an internal draft writer shared by all `editArchive()` actions. Retain byte-compatible stored output when its deterministic size estimate fits the current limit. If stored output would exceed the limit, use `writeCompressedZipEntries()`; use stored per-entry fallback for incompressible entries exactly as that writer already does. Never silently enlarge the serialized-output cap.
2. Separate structural/expanded-size validation from compressed-size validation in `prepareIncoming()`. The synchronous review can validate names, conflicts, count, expanded bytes and unavoidable ZIP headers. It cannot know compressed size. Definitive compression/output validation occurs before publication; an overflow leaves the current archive, review and history intact with a clear error.
3. Copy all caller-owned metadata and byte buffers before the first asynchronous compression boundary, including later import entries. Existing snapshots already do much of this, but preserve that invariant when introducing the new helper.
4. Keep explicit export choices unchanged. Users may still request stored ZIP, compressed ZIP, TAR or TAR.GZ. Stored export may correctly refuse a large draft; its message should point to compressed export. Draft compression is an internal representation, not a promise to retain the original archive's method/ratio/format.
5. Route native/file import review helpers through the same policy; inspect any desktop preflight that independently assumes stored output. Do not accept renderer-reported compressed sizes as authority.
6. Retain epoch/context/parent exact-input guards around the longer asynchronous operation. A superseded compression result must not publish, record history, change the active child or call native saving. History accounting remains serialized decoded archive bytes, with its existing 64 MiB bound; no unbounded expanded snapshots in sessions.
7. Keep existing metadata-loss disclosure honest. Update copy only where necessary to explain an archive exceeding stored-export limits; no new theme/UI overhaul is needed.

Potential files: `src/archive-edit.cjs`, `src/archive-compare.js`, and any native archive import preflight discovered during implementation. Existing `src/archive-core.cjs`, `src/archive-history.cjs` and `src/tar-write.cjs` should not need expanded format or limit changes.

## Required evidence before calling it complete

### Core and independent interoperability

- Rename/delete/copy/add/add-folder on an input under 32 MiB with expanded content between 32 and 64 MiB succeeds when the compressed result fits; bytes, names, CRC, empty directories, timestamps and ordinary permissions round-trip.
- A single unchanged small edit continues to produce the existing deterministic stored output.
- Incompressible output over 32 MiB, content over 64 MiB, excessive entries, corrupt CRC, unsafe names/type conflicts and unavailable/failing raw-deflate all reject before publication. Do not rely on randomness for exact boundary assertions.
- Held compression plus mutation of later source buffers/metadata still emits the captured snapshot. Test back-to-back operations and cancellation/reset while compression is held.
- Verify generated drafts with Python `zipfile` (independent decoder), including method flags, filenames and exact content hashes. Run existing archive ZIP64 input, compression and TAR export suites unchanged.

### Renderer, child and native workflows

- Real Archive Compare rename/import/copy review on the large-expanded fixture; cancel, failed apply and successful retry; undo/redo and saved session reopening retain exact edited data and source bytes.
- Real child text or binary writeback into such an inactive parent (use several entries totaling over 32 MiB, with the edited child below its existing 32 MiB limit), followed by preserved XLSX child regression; stale parent/replaced source refuses. Parent undo restores the prior archive while child content remains unchanged.
- Held compressor then reset/tab close/replacement: no delayed publication or dirty/history change. Hold native save reply separately and wait for semantic enabled controls before sending undo.
- Test explicit compressed export succeeds and explicit stored export fails clearly when appropriate; TAR/TAR.GZ behavior remains unchanged.
- Source native Electron tests, then final packaged Apple Silicon and Intel Mac acceptance and archive/source integrity checks. Windows runtime testing remains deferred by the user; do not claim it passed merely because a Windows ZIP was built.

## Subsequent milestone

After compressed drafts are shipped, prioritize safe encrypted-ZIP **read-only** comparison if password-protected archives are the most common remaining input failure. First perform a dependency/design review for standard AES ZIP interoperability, authenticated integrity, password handling and decrypted session persistence. Treat encryption, large-file streaming/ZIP64 output, extra formats and exact original metadata preservation as separately tracked capabilities—not completion claims attached to this small draft fix.


## Source implementation progress after 2.192.0

The draft writer now retains stored bytes when they fit and falls back to deflate without raising serialized or expansion limits. Add preflight permits compressible content and checks aggregate expanded size and header overhead; final output remains bounded. Focused regression tests cover independent ZIP readback, failed incompressible output and unavailable compression without source mutation. Native rename, child text writeback, undo/redo, session restoration and independent exported payload verification pass. The Save dialog selects deflate when stored output would exceed the bound. Released in 2.193.0 after both Mac packaged acceptance suites, download/package checks and installed startup smoke. This does not complete broader archive-format requirements.
