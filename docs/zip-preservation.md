# ZIP preservation

Parsed ZIP archives now default to **Preserve** for saves and in-memory edits. This policy also applies to archive child-result writeback and copying entries from a parsed ZIP into a new archive. Original source files are not modified; saving publishes a separate archive through the existing review flow.

## Save and edit behavior

- An unchanged save returns the original ZIP bytes exactly, after validating every source member's decoded size and CRC. Unknown extra fields can therefore survive an unchanged save without being interpreted or rewritten.
- Add, replace, copy, delete, and rename preserve qualified metadata on retained members. Unchanged compressed payloads are copied exactly. Renames rewrite names and relevant headers, retaining compressed payloads; changed content retains its original stored/DEFLATE method. New entries and entries copied from non-ZIP sources are stored.
- Archive and entry comments, creator/host attributes, external attributes, ordinary permissions, timestamps, and supported extra fields are retained. Original special permission bits and unknown permission metadata remain intact under preservation; this does not grant those permissions on disk.
- Existing member order is retained where possible; new or renamed paths are appended in desired-entry order. Central-directory offsets are adjusted, so an edited archive is not generally byte-identical outside its unchanged local member records.
- An unspecified replacement timestamp preserves the prior timestamp. Explicit timestamp changes update DOS time and present extended/NTFS modification timestamps; access and creation timestamps remain unchanged.
- Every target member is integrity-checked, including deleted members. Used source archives are also fully checked. A corrupt entry cannot be removed to bypass validation.

Preservation uses parser-owned snapshots, not offsets or compressed data supplied by callers or saved sessions. Input bytes are copied before asynchronous work, including Node Buffer inputs. Restored sessions reparse their embedded archive bytes to establish fresh authority. Undo and redo retain archive bytes, so they also retain preservation metadata.

## Qualified metadata and refusal

Editing supports stored and DEFLATE entries, qualified data descriptors and small ZIP64 layouts, and these bounded extra-field layouts:

- ZIP64 sizes and offsets;
- extended timestamps (`0x5455`) and NTFS timestamps (`0x000a`);
- Unix UID/GID (`0x7875`);
- matching Unicode path/comment fields (`0x7075`, `0x6375`).

Malformed, duplicate, conflicting, or unsupported extra fields refuse preservation edits. Other refusals include unclassified prefixes/inter-entry data, signing data, ZIP64 extensible data, signed JAR entries, unsupported flags, and Unicode renames that would reinterpret legacy-encoded comments. A successful unchanged save does not imply that editing the same package is supported. There is no automatic fallback that silently discards metadata.

## Explicit rebuild

The review dialog offers **Stored** and **Deflate** as deliberate rebuilt-ZIP choices. These use the existing portable-entry writer, preserving supported entry content and ordinary permissions while normalizing output metadata. They do not promise original comments, extras, compression streams, host attributes, unknown modes, or special permission bits. Unknown permissions receive ordinary defaults; special bits are omitted. Rebuilt exports do not change the current in-memory draft. Explicit rebuilds remain subject to integrity and path checks.

TAR, compressed TAR, and encrypted-archive handling retain their existing behavior. This milestone does not add encrypted ZIP preservation, signature maintenance, arbitrary ZIP metadata rewriting, or extraction onto the filesystem.

## Bounds and qualification

Output is bounded to 32 MiB, desired expanded content to 64 MiB, and entries to 50,000. Combined source bytes and expanded content are bounded to 64 MiB, source-member work to 100,000 entries, and path-processing work to 8 MiB. Existing portable-path, parent-conflict, case-alias, symlink, and parser admission checks remain enforced. These are bounded application limits, not general ZIP format limits.

Independent Python and Info-ZIP fixtures cover mixed compression, comments, Unix metadata, Unicode names, streamed descriptors, and small ZIP64 archives. Tests include:

- `test/zip-preserve-core.test.cjs` and `test/zip-preserve-independent.test.cjs`: raw member metadata/payload retention, unsupported metadata, timestamps, corruption, ownership and resource limits;
- `test/archive-edit-preserve.test.cjs`: default preservation, add/replace/copy/delete/rename, new targets, explicit rebuild and asynchronous mutation isolation;
- `test/archive-permission-validation.test.cjs` and `test/archive-permissions-independent.test.cjs`: preservation versus rebuild permission contracts;
- `test/zip-preserve-history-browser.cjs`: review cancellation, history, sessions, child writeback and refusal/rebuild behavior;
- `test/zip-preserve-desktop.cjs`: actual native saves, exact unchanged output, comments/compressed payloads, undo/redo, session reopening and unchanged source files.

The source acceptance suite passed 2,760 tests with one skipped test. Browser and development Electron preservation acceptance passed. Packaged release acceptance is a separate gate; it is not implied by these source results.

## Release acceptance — 2.224.0

Mac ARM64 and Intel packaged native save/history/session tests passed. All 17 static package audits passed across Mac and Windows, including exact bundle/dependency closure and extracted-module preservation checks. Download links, sizes and SHA-256 passed. The installed ARM64 app passed its asset audit and isolated startup smoke; Finder Services are current. The previous 2.223.0 app is retained as a backup. Windows runtime testing remains user-deferred; public signing/notarization remains separate.
