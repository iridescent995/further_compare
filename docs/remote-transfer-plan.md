# Remote folder transfer implementation plan

Status: **selected regular-file Copy integrated into native sessions and folder UI; source and final visual checks pass; packaged in 2.157.0 and verified on both Mac architectures**. SFTP text saving is a separate workflow; it does not enable folder transfers. This plan covers reviewed local↔SFTP and SFTP↔SFTP copy, with recursive copy/move/sync tracked as subsequent work. Existing local operations must retain their behavior.

## Current architecture and UI

`src/app.js` routes selected Copy/Move/Delete through `folderAction`, `desktop.previewAlignedFolderAction`, `displayPlan`, and the existing Apply button. `displayPlan` already renders operation source/target paths, overwrite markers, scope, and unresolved entries. Keep that interaction; add transfer details to its existing description rather than introducing a separate transfer screen.

`desktop/window-runtime.cjs` handles `folders:tree-preview-action`: resolve selected opaque row IDs against a tree revision, build a planner, and retain it in `pendingPreview`. `folders:execute` checks the plan ID, shows a second native confirmation, and calls `plan.service.execute`. Aligned merge/mirror routes use `folders:tree-preview`; update-both is separate. Remote folder channels are currently restricted by `remoteReadChannels`, and renderer controls/context actions are disabled via local-only capabilities.

`FolderService.preview/execute` and `MappedFolderOperations` are filesystem implementations. They validate namespace/alignment, apply operation scope, create backup manifests, copy overwritten files into local recovery storage, verify digests, stage replacements, and report partial completion. They are not generic remote writers: do not pass SFTP URLs into `safe`, `fs`, or native path functions.

`ProviderFolderService` supplies mixed-endpoint metadata, directory enumeration and readers, with local endpoint adapters. `SftpFolderProvider` exposes weak metadata observations, path checks and bounded readers. `sftp-text-save.cjs` provides atomic remote replacement patterns but is tied to existing text inputs, a 10 MB limit, and an in-memory buffer. A transfer engine needs streaming bytes and independent destination authority; it must not decode/re-encode or inherit the text limit.

## Exact next implementation slice

Implement **reviewed copy of explicitly selected regular files into existing destination parent folders**, for all three direction combinations, including both new files and replacement. Use the existing Copy arrows/context actions and plan dialog. Multiple selection, mapped target names and byte-exact binary data are part of this slice. Reject selected directories with a clear explanation until recursive inventory is implemented; do not silently omit them or copy only their currently visible children.

1. Add `desktop/provider-folder-transfer.cjs`: a native planner with `previewCopy(side, mappings, scope)` and single-use `execute(id, {signal,onProgress})`, plus unit/fixture tests. Its stored plan holds source/destination endpoint objects, root authorities, source/target relative paths, original metadata/digests, and byte totals. Renderer output contains only descriptive operations and opaque ID.
2. Add small destination adapters for local and SFTP paths. Keep local root checking and symlink refusal in the existing native authority implementation. Implement stage/create/replace/verify/cleanup contracts rather than exposing arbitrary remote mutations to the renderer.
3. Dispatch the remote `action==='copy'` branch in `folders:tree-preview-action` to the new planner; preserve all-local dispatch. Resolve target from the paired row or `tree.alignment.counterpart`, never simply source basename. Use `pendingPreview.service` and the existing execute confirmation.
4. Add capability-based Copy enablement to pane arrows and context actions. Allow only the implemented copy/execute channels through the native remote guard, with action checks before dispatch. Do not broadly allow Move/Delete/Mirror because Copy became available.
5. Show progress and partial/unknown results through the existing plan/status surface. Refresh affected tree nodes and invalidate stale summaries after any possible mutation, including a failed or uncertain execute.

This is an implementation milestone, not a redefinition of the full recursive transfer goal.

## Existing review integration constraints

The current renderer's `displayPlan` expects each mutation to use `action: 'copy'`, `sourcePath`, `targetPath`, and `overwrite`; it enables Apply from `operations.length`. The provider preview's `create` / `replace` / `skip` observations must be translated at the native integration boundary: identical-content skips belong in a separate skipped count/list, not in the executable mutations or confirmation count. Preserve mapped paths in the description.

`folders:execute` currently promises recovery backups in its native confirmation and invokes a queued service execution. Remote writes must not be enabled until that promise is implemented with verified local recovery copies and an immediate Stop route. Its `finally` path invalidates the tree, which must remain true after partial or unknown transfer outcomes. The local implementation uses rename after an absence check; a new remote-capable adapter must provide tested no-replace publication for new files instead of inheriting that race.

The native batch executor attaches per-file results to failures. Electron IPC does not preserve arbitrary Error properties: the runtime integration must catch these failures and return a structured result (or explicitly serialize the outcome) so completed, unknown and unattempted entries and backup paths reach the renderer. Do not reduce a partial batch to a generic thrown message or mark all entries failed. Copy plans are single-use, and native session/root replacement must revoke the plan and abort its active controller.

## Preview and authority prerequisites

Preview reads all selected source bytes to compute digests and compares any existing target bytes; no writes occur. Store digests even when remote size and timestamps match. Validate root and path chains both before and after reads. Copy mappings must reject duplicate destinations, self-copy aliases, file/directory conflicts, missing parent folders in the first slice, and stale tree revisions. Selection must be unique and bounded (initially at most 1000 files).

Reuse `validateOperationScope` and filter semantics, but audit `selectOperationEntries`: its current portable path validation rejects drive-like colon names. Remote names can legitimately contain colons; a remote-only mapping must not accidentally apply Windows path rules. A local destination must reject unrepresentable/reserved names before preview approval. Case/Unicode aliases need endpoint-appropriate validation; avoid silently overwriting another spelling.

Capture stable native connection leases for the plan's endpoints, with explicit cleanup on cancellation, replacement, expiry and session disposal. Root reconnect, side swap, alignment change or session change invalidates a plan. Do not let a global operation queue delay Stop until the whole network transfer finishes: cancellation needs an immediate scoped request and controller. A canceled SFTP request currently closes the shared connection, so the UI must report that reconnect is required and account for other tabs sharing that transport.

## Execution semantics

- Stream bounded chunks (for example 64 KiB) from an authenticated source reader into an exclusive sibling stage. Never buffer whole files or convert binary bytes to text/base64 in the renderer. Verify streamed count/digest and source reader/path metadata after the read.
- Back up every existing destination into the application's local recovery directory before any destination is replaced, preserving current local-copy recovery expectations. Use native opaque backup filenames plus manifest mappings so a remote colon/Unicode filename never becomes an unsafe local backup path. Verify backup digests. Report local disk-space/permission failure before publication.
- After approval and again before publishing each file, revalidate source and destination against preview. A same-size preserved-timestamp change is a conflict. Report equal-content files as skips, without unnecessary replacement.
- Existing remote targets require advertised atomic POSIX rename capability. New remote files need no-replace publication semantics: use the protocol's no-overwrite rename contract only where supported/tested, never the overwrite extension after a mere existence check. Existing local replacements use the established native safe staging behavior; new local publication must fail if another file appeared since preview (an exclusive/no-replace publication primitive).
- Apply ordinary mode/mtime policies explicitly. Do not claim preservation of owner/group, ACLs, xattrs, resource forks, alternate streams or special permission bits unless implemented and verified. Stage permission defaults must be restrictive.
- Verify published bytes and refresh observation. If a connection disappears after rename submission, record **outcome unknown** for that item, stop the batch, retain recovery information and do not automatically retry. An acknowledged publication followed by verification failure is distinct from a pre-publish failure.
- A batch is not atomic. Results must identify completed, skipped, failed, unknown and unattempted items; never say “nothing changed” when earlier files were committed. Preserve backups and stages requiring investigation, with explicit paths where available. Cleanup may remove only stages owned by this operation, never originals.

SFTP v3 lacks conditional content replacement and directory-handle-relative rename. Hash checks detect observed stale sources but cannot eliminate an external edit/path-replacement race between the final check and publication. Atomic rename does not supply compare-and-swap. Keep that limitation explicit; do not advertise conflict-proof remote copying.

## SFTP publication protocol evidence

The [SFTP version 3 draft, section 6.5](https://www.ietf.org/archive/id/draft-ietf-secsh-filexfer-02.txt) specifies that ordinary `SSH_FXP_RENAME` fails when its new path already exists. The installed ssh2 `rename` sends that ordinary request; `ext_openssh_rename` sends the separate overwrite-capable POSIX extension. New files therefore use ordinary rename, while reviewed replacements require the advertised extension. This relies on the server implementing the protocol correctly; it is not a guarantee against a noncompliant server.

The write-enabled fixture models ordinary regular-file rename with exclusive link creation followed by source unlink. It must not use overwriting `fs.rename` for this case. Tests inject a competing destination immediately before publication and check that its bytes survive.

## Recursive copy, move and sync follow-on

Recursive selection requires a complete bounded provider inventory independent of expanded/visible rows, preserving include/exclude/search/status scope and ignored descendants. Create required directories in parent-first order, reject alias collisions and unsupported links, then transfer files. Preview must disclose incomplete inventory limits and refuse execution of an incomplete plan. Reuse filter/alignment semantics without traversing unrelated roots.

Move is verified copy followed by separately revalidated source removal. Never remove a source after uncertain destination publication. Source deletion races also exist on SFTP; a remote move cannot inherit the stronger local identity guarantees silently. Remove directories nonrecursively so ignored/unreviewed/new entries remain. Report copy-success/delete-failure as partial move. Mirror/delete and update-both require separate reviewed semantics and recovery tests; they must remain disabled until those implementations exist.

## Meaningful verification

- Actual fixture transfers in local→SFTP, SFTP→local and SFTP→SFTP directions, including distinct servers; exact binary bytes, empty files and files larger than 10 MB with bounded-memory assertions.
- Selected source/paired target names differ through alignment; one-sided new target; two selections collide; self-copy; unsupported local filename; Unicode/colon remote-only names.
- Preview/cancel performs zero writes. Review IDs are owner-bound, single-use and invalid after reconnect, swap, alignment change or tab closure.
- Same-size source or target mutation preserving timestamps after preview rejects. Source changes during streaming, symlinks and parent replacement reject at observed validation points.
- All overwrite backups verify before first publication; backup failure causes no destination modifications. Recovery manifest maps remote paths safely.
- New target appears after preview: no replacement. Existing target replacement requires supported atomic extension; unsupported/wrong-version capability fails before staging.
- Write, fsync, close, rename, post-verify and cleanup failures produce accurate per-file results. A second-file failure preserves first-file success and identifies remaining unattempted files.
- Hold a request, issue immediate Stop, verify no later publication/source deletion, transport closure behavior and retained recovery state. Lose rename acknowledgement and verify unknown outcome/no retry.
- Desktop UI uses existing arrows and right-click Copy, displays exact direction/overwrite paths and scope, keeps unrelated actions disabled, and refreshes colors after completion or partial failure.
- Recursive follow-on tests must include collapsed descendants, excluded/ignored files, missing parents, inventory limits, partial move deletion and nonrecursive directory retention.

## Streaming source implementation

`desktop/provider-file-snapshot.cjs` now provides a shared bounded 64 KiB reader with awaited chunk delivery, SHA-256, byte counts, retained-handle/path/root validation and cleanup. It supports files beyond the text limit without buffering the whole input. `sftp-text-save.cjs` uses it while retaining its explicit 10 MiB text limit. Callers must finish the snapshot, compare the digest with the approved source baseline, and validate the destination before publishing staged chunks.

Seventeen snapshot unit tests and twelve existing remote-save helper tests pass. The actual Electron remote origin/save lifecycle regression also passes (`/private/tmp/fc-stream-snapshot-origin.log`). Six real local/SFTP integration tests pass for files larger than 10 MiB, empty files, matching hashes, awaited bounded sinks, cancellation and observed source growth (`/private/tmp/fc-provider-snapshot-integration.log`). This source change is not yet packaged; 2.156.0 remains the latest verified release. No folder transfer action is enabled by this prerequisite alone.


## Read-only selected-file preview implementation

`desktop/provider-transfer-preview.cjs` now implements `prepareProviderCopy`, `revalidateProviderCopy`, and `revokeProviderCopy`. Native WeakMap state retains endpoint and hash observations; the immutable public review contains only an ID, mapped source/target paths, create/replace/skip actions and the non-skipped byte total. Plans are limited to 1000 regular files with existing destination parents. Sources and existing destinations are streamed and hashed, then checked again before preview publication. Revalidation checks original content, newly appeared targets, root and parent authority; revocation during an awaited read prevents successful completion.

Duplicate destinations, source/destination overlap, local strong-identity aliases and same-connection canonical SFTP aliases are rejected. This does not discover all aliases between independent server connections or provide an atomic multi-file observation. Remote metadata remains weak, and execution will still require source/destination verification immediately before publication.

Nineteen unit tests and seven real-provider integration tests pass. The latter exercise local→SFTP, SFTP→local and SFTP→SFTP with files over 10 MiB, mapped targets, identical skips, preserved-timestamp content changes, newly appeared targets and held-read cancellation. Preview and revalidation perform no writes. Evidence: `test/provider-transfer-preview.test.cjs`, `test/provider-transfer-preview-integration.test.cjs`, and `/private/tmp/fc-provider-preview-integration.log`.

Execution, recovery backups, destination adapters, endpoint-specific filename validation, native session/connection lifecycle binding, operation scope, UI integration, recursive transfers and packaged verification remain outstanding. The preview module alone does not enable a folder-copy command.


## Recovery backup implementation

`desktop/provider-transfer-backup.cjs` streams approved destination observations into an exclusive local recovery directory, using generated filenames and a sanitized manifest mapping original relative paths to exact hashes and byte counts. Source bytes are never decoded. Files use restrictive permissions, bounded writes with partial-write handling, file sync, independent saved-byte hashing and a final verification pass before the complete manifest is published with an exclusive hard link. Cleanup checks ownership and never recursively removes a replaced directory or an unexpected file.

`backupProviderCopy` in the preview module selects only approved replacement targets from private plan state. Create and identical-skip operations require no backup. It revalidates before and after creating recovery copies; if the plan changes afterward, it rejects and reports the retained backup path. This still does not authorize destination writes.

Four wrapper tests, fourteen backup-helper tests and nineteen preview regressions pass (`/private/tmp/fc-copy-backup-unit.log`). Three real SFTP backup tests pass for files over 10 MiB, empty/Unicode/colon names, restored-timestamp stale content and held-read cancellation (`/private/tmp/fc-provider-backup-integration.log`). No test performs remote writes. Backup contents and manifest are synced; directory-entry crash durability still needs a platform-aware implementation before promising durable recovery across power loss. Destination writing/publication, cancellation outcomes, session-bound UI integration, recursive operations and packaged testing remain outstanding.


## SFTP destination writer implementation

`desktop/sftp-transfer-writer.cjs` streams a reviewed source into an exclusive remote sibling, verifies staged bytes, applies ordinary source mode and second-resolution modification time when valid, uses fsync when advertised, then rechecks source, stage, target and parent/root authority before publication. Source access time is not preserved: SFTP v3 time updates set it to source modification time. Ownership, ACLs and extended metadata are not preserved. Unsupported metadata updates fail before publication.

New destinations use ordinary no-overwrite rename; replacements require advertised POSIX rename. Post-publication bytes are verified. Lost acknowledgements, including numeric connection-loss status codes, report an unknown outcome without retry; acknowledged publication with failed verification reports a distinct failure. Cleanup removes only observed owned stages, including when a local source cancels while the destination transport remains healthy. Plain Uint8Array source chunks are converted to the Buffer interface required by ssh2 without buffering entire files.

Sixteen writer unit tests pass for large binary/empty create and replace, staleness, destination appearance, corruption, write/metadata failures, uncertainty, cancellation, native buffer conversion and cleanup. The real-server regression group passes eight new writer tests plus twenty existing text-save/transport tests (`/private/tmp/fc-sftp-transfer-writer-final.log`). The existing text-save helper also now treats numeric SFTP connection-loss statuses after rename as unknown; its thirteen unit tests pass.

This is a native single-file primitive. The caller must finish reviewed recovery backups before replacing a destination. No folder-copy UI or batch executor invokes it yet. Remaining work includes local destination writing, durable recovery directory entries, batch outcome accounting, session/Stop integration, recursive operations and packaged platform tests. Source and destination checks remain observations; SFTP provides no conditional content replacement or fully race-free remote namespace operations.


## Local destination writer and batch execution

`desktop/local-transfer-writer.cjs` implements bounded streamed local creation/replacement with source/destination/parent authority checks, stage hashes, file sync, ordinary permissions and modification time. New files use exclusive hard-link publication; replacements use reviewed rename. Stage unlink precedes capturing the returned new-file observation because link-count changes affect ctime. A failed stage unlink after publication produces a cleanup warning instead of pretending publication failed. Case/Unicode spelling conflicts, strong-identity aliases and symlink paths are rejected. Windows destination name validation is unit-tested as a pure function; Windows runtime is still unverified.

`executeProviderCopy` now consumes a preview once, creates and verifies all replacement backups before the first write, and invokes a trusted native writer adapter for each non-skipped file. It preserves per-file completed, skipped, failed, unknown, verification-failed and unattempted outcomes plus the recovery path. Revoking a running plan aborts its controller. Stop after a successful item leaves subsequent untouched items unattempted. Missing or inconsistent writer verification results are unknown outcomes, never assumed success or definite publication. There is no automatic retry after a partial batch.

Fourteen local-writer tests, seven batch orchestration tests, four backup-wrapper tests and nineteen preview regressions pass (44 total; `/private/tmp/fc-local-batch-unit.log`). Final actual local/SFTP verification passes nine tests: five remote-to-local writer cases and four full batch cases across all three directions, including a second-file write failure with retained first-file completion and backups (`/private/tmp/fc-local-batch-integration-final.log`).

No folder-copy UI currently invokes this engine. Session/root/connection ownership, immediate Stop IPC, endpoint-specific preflight and operation scope, structured outcome rendering, recovery directory-entry durability, recursive operations and packaged cross-platform checks remain required. These source changes are not a new packaged release.


## Native session and folder UI integration

Remote selected-file Copy now uses the existing pane arrows, main Copy controls, right-click menu, review dialog and native confirmation. Directories remain unavailable pending recursive inventory. Native preview compares selected files under the current rule/filter scope, resolves mapped destinations, rejects unsupported replacement capability before review, and retains a session/tree-bound plan. Side replacement, tab/root changes, alignment changes, session closure and disposal revoke retained authority. Immediate Stop aborts preview or execution; per-request nonces also cancel previews still waiting in the native queue without cancelling a later fresh request.

The runtime returns structured per-file outcomes across IPC. The renderer keeps a result dialog visible after partial/unknown outcomes even if reconnect/refresh fails, shows completed/skipped counts and recovery paths, and disables reapplication of consumed reviews. History retains known completion counts for failed/cancelled attempts and bounded per-file statuses. Progress is session/plan scoped. This extends the existing view rather than creating a remote file browser.

The actual Electron native suite passes all directions, mapped files, review cancellation, exact bytes/recovery copies, replay/stale plan rejection, root/swap/session revocation, partial writes, held-read/write Stop, and queued-preview cancellation (`/private/tmp/fc-provider-copy-desktop-final.log`). Actual UI tests pass context/toolbar enablement, directory restrictions, review cancellation, exact two-copy/one-skip success, partial results and preview/dialog Stop (`/private/tmp/fc-provider-copy-ui.log`). Light/dark result screenshots were inspected; the corrected dark unattempted row passes a 4.5:1 contrast assertion and final screenshot inspection. The full UI suite passes after the correction (`/private/tmp/fc-provider-copy-ui-final.log`). Nine history unit tests and extended browser history verification pass.

These changes are source-only. Packaging and both Mac packaged workflows are required before release. Windows runtime, recovery directory-entry crash durability, recursive transfers/move/mirror, remote session restoration and broader product parity remain unfinished.
