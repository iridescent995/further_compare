# Proposed SFTP text save workflow

Status: **packaged in 2.156.0; source and both Mac packages verified**. The design below is the original implementation guide. The runtime uses a single serialized native `text:save-remote` transaction: prepare, native review, commit. Review plans remain native and are never exposed to the renderer. The existing Save As action still writes a local copy.

## User workflow

Add **Save to server…** to a remote text side's menu and context menu. Keep a clearly labelled **Save local copy…** action. The remote action reviews the native-authorized server path, output encoding and byte count before replacement. A successful save retains the remote label and allows another save. Edits made while saving remain dirty. A stale source is rejected with a request to reopen/compare the server version; there is no implicit force overwrite.

## Native integration

- `desktop/provider-folder-open.cjs`, `stageProviderFolderOpen`: retain a SHA-256 digest of each original raw byte sequence in native observations. Do not derive the digest by re-encoding editor text: decoding can lose byte distinctions.
- `desktop/window-runtime.cjs`, `openRemoteTreeChild`: text children currently store native origin provider, relative path, parent connection ID and observation in `remoteChildOrigins`. Unlike directory children, they do not retain their own registry lease. Retain a child-owned lease at publication, using `sftpRegistry.retainConnection`; release it on child disposal. A parent closing must not invalidate an independent editable child's connection.
- `loaded`: invalidate an existing remote origin for the replaced side when opening a local input or completing local Save As. Side clearing also needs a native origin-revocation path. Swaps already swap origins; prepared save plans must be invalidated on swaps.
- Add separate native prepare/commit remote-save handlers. Their input is session ID, side, text and output format. Resolve path/provider/connection solely from the native origin, never a renderer-supplied URL. Validate encoded size against the text limit.
- Prepare captures the source identity, original digest, output bytes/digest, side generation and connection lease in a bounded, expiring, single-use native plan. Return only review metadata and an opaque plan ID. Commit checks ownership and generation again. Session close/reset, side replacement, swap and disconnect revoke pending plans.
- `desktop/preload.cjs`: expose the two narrowly scoped operations.
- `src/app.js`, `setLoaded` and `saveText`: retain a safe remote-save capability marker for menu visibility; distinguish remote results from local path results. Only clear dirty state if the editor revision still matches the submitted revision. Keep remote origin identity out of persisted renderer sessions.

## Publishing strategy and its limits

SFTP v3 metadata has second-resolution modification times and no reliable inode identity. Metadata comparison alone misses equal-sized edits with preserved timestamps. Before writing, reread the original using the provider reader and compare its raw digest and metadata to the opened observation. Validate the root and every path component using the existing provider's non-symlink checks.

Stage encoded output in a random sibling file opened exclusively (`wx`) with restrictive permissions. Write bounded chunks, preserve supported ordinary permission bits, and verify staged size/content. Use fsync when advertised, close the staged handle, then revalidate the original content and path immediately before publication. Stage cleanup must never delete or truncate the original.

For replacement, require the server's advertised `posix-rename@openssh.com` version `1` extension and use `ext_openssh_rename`. Do not implement a fallback that unlinks the original or renames it out of the way before publishing. If atomic replacement is unavailable, retain local-copy functionality and explain that this server cannot support the remote replacement action. That is an explicit feature limit, not a claim of general remote-save parity.

**Atomic rename is not conditional content replacement.** Neither SFTP v3 nor the OpenSSH POSIX rename extension supplies content compare-and-swap. Another writer can change the original after the final hash check and before rename. Path components can also change in that interval; SFTP lacks a directory-handle-relative rename API. Therefore this design detects observed stale sources but cannot promise race-free protection against concurrent external writers or hostile namespace changes. Do not label it conflict-proof. Fully conditional save would require additional server-side coordination/capability and must remain a separately tracked requirement.

A recoverable failure before publication cleans up only the exclusively created stage and preserves the original. A disconnect or timeout after submitting rename has an **unknown outcome**, since the server may have committed without returning an acknowledgement. Report that state explicitly and ask for a fresh comparison; do not automatically retry replacement or claim failure left the original untouched. If post-publish verification succeeds, update the native baseline digest/observation. If verification fails after acknowledged rename, report that the save occurred but verification failed rather than treating it as a pre-write failure.

## Transport capability discovery

`desktop/sftp-connection.cjs` currently whitelists open/write/close/rename/unlink/fsetstat/setstat, but not extension calls. Installed ssh2 implements `ext_openssh_rename` and `ext_openssh_fsync`; their methods inspect the negotiated channel `_extensions` map for exact supported versions. Merely checking method existence is insufficient because the methods exist for unsupported servers too.

Introduce a small native adapter that snapshots only the recognized negotiated capabilities after SFTP channel establishment. The current installed ssh2 exposes negotiation through an internal `_extensions` map, so isolate this dependency in one tested adapter tied to the pinned dependency version. Do not expose the map or raw channel to the renderer. Whitelist the two extension methods only as needed and enforce the capability check before staging. Unsupported/unknown versions must remain false. Preserve request deadlines and the existing connection-wide cancellation semantics.

## Fixture changes needed

`test/sftp-server-fixture.cjs` currently accepts only read-only OPEN flags, implements no WRITE/RENAME/UNLINK/FSETSTAT, and has request/hold hooks. Extend it for opt-in write tests so existing read-only tests retain their constraints:

- Advertise selectable extension/version combinations during SFTP negotiation; support the corresponding EXTENDED rename and fsync requests.
- Implement exact exclusive creation flags, bounded offset writes, handle permission changes, close, unlink, and POSIX atomic replacement using files under the temporary fixture root.
- Record side effects and support deterministic failure/hold points before write, during writes, on close, before rename, after rename before acknowledgement, and during post-save validation.
- Provide a mutation hook that changes bytes while preserving size and second-resolution mtime.
- Preserve sandbox path constraints and close all handles on client disconnect. Verify originals and sibling temporary files directly on disk after each case.

## Required tests before shipping

1. Plain and BOM/non-UTF-8 text save writes exact encoded bytes to the selected side; a second save uses the refreshed baseline.
2. Equal-size source mutation with restored mtime rejects before any replacement.
3. Missing original, changed metadata, root/path replacement and symlink substitution reject; original data remains intact.
4. Partial write, permission failure, stage close failure and verification mismatch preserve original and clean up the stage when connected.
5. Absent or wrong-version rename extension rejects without staging or deleting the original; recognized version succeeds.
6. Disconnect before publish versus disconnect after server rename but before acknowledgement produce distinct preserved/unknown outcomes, with no automatic retry.
7. Cancelled review sends no writes. Foreign, expired, replayed and side-generation-stale plans reject.
8. Local open/Save As, clear, swap, tab close/reset and disconnect invalidate obsolete plans and origins.
9. Closing the parent retains the child lease; closing the child releases it. Two children cannot accidentally consume each other's plan or origin.
10. Editing during save retains newer dirty edits. Success keeps the SFTP label and server-save action; local-copy action still works independently.
11. Real desktop fixture test exercises open, edit, review cancel, review commit, server bytes, repeat save and stale-source rejection.
12. Deterministic concurrent mutation at the final hash/rename boundary documents the protocol limitation; tests must not assert conditional atomicity that the server does not provide.

Implementation evidence: `desktop/sftp-text-save.cjs`, `test/sftp-text-save.test.cjs`, `test/sftp-write-transport.test.cjs`, `test/sftp-text-origin-desktop.cjs`, and `test/sftp-text-save-desktop.cjs`. Twelve helper tests, 32 transport/provider/write tests and native origin/save lifecycle tests pass. Renderer verification covers confirmation, exact encoded bytes, newer edits, tab restore, swap, stale-source rejection and local-copy revocation. Clear-button guard and compact light/dark path layouts pass. Final packaged UI, native save lifecycle and child-open regressions pass on both Mac architectures; see `release-2.156.0.md`. Windows runtime remains unverified.

Replacement preserves ordinary POSIX permission bits. Ownership, ACLs, extended attributes and other server metadata are not preserved by this first implementation. Atomic rename support is required; other servers retain local-copy functionality. General remote transfers and remote-session restoration remain separate unfinished capabilities.
