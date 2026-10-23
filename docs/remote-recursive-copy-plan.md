# Recursive remote Copy: next implementation milestone

Status: recursive remote Copy is packaged in 2.158.0 and verified through native and actual renderer workflows on Apple Silicon and Intel Mac. Selected collapsed folders include eligible descendants, nested and empty directories for local↔SFTP and SFTP↔SFTP. All three archives and downloads are verified; actual Windows runtime remains unverified.

## Current reusable pieces and gaps

- `folder-filename-inventory.cjs` already performs provider metadata traversal with a queue, root and entry observations, limits, cancellation, progress and no partial return. It scans whole roots, not selected subtrees, and its final directory-stamp check is weaker on SFTP than a namespace comparison.
- `folder-operation-scope.cjs` validates scope and uses `filterEntries` to select files/directories while preserving actual ancestry. It requires complete ancestor inventory; feeding only visible rows is invalid. `folder-operation-inventory.cjs` builds aligned paired rows from snapshots and classifies them using rules.
- `folder-projection.cjs` and `FolderAlignment` implement mapped directories, reserved counterparts and synthetic destination parents. Their validators and snapshot fields are oriented toward existing local snapshots. In particular, drive-like colon names are rejected even when valid remote names; provider observations use `stamp`/`sha256` rather than the local snapshot `revision`/`hash` contract.
- `folder-operation-name-matching.cjs` discovers automatic alignment from complete root namespaces. Filename matching cannot be made correct by pairing only the currently loaded rows or an incomplete subtree.
- `provider-transfer-preview.cjs` currently permits regular files with existing destination parents. Its executor already backs up all replacements before publishing, carries cancellation, consumes plans once and reports per-file outcomes. The local and SFTP writers stream bytes and must remain the file publication primitives.

## Build a complete selected-subtree inventory first

Add `desktop/provider-subtree-inventory.cjs` with a native API such as `scanProviderSubtrees(endpoint, selections, {signal, isIgnoredPath, maxEntries, maxNodes, maxDepth, onProgress})`. It returns opaque observations plus an immutable metadata inventory and explicit coverage, only when traversal finishes successfully.

Normalize overlapping selections: selecting `src` and `src/java` must enumerate/copy descendants once. Preserve explicitly selected empty directories. Capture ancestors outside the selection for authority checks, marking them as context rather than selected content. Traverse iteratively in deterministic order, with initial limits matching established inventory limits (50,000 inspected entries and 5,000 directories), plus an explicit depth limit to avoid pathological paths. Count ignored and unsupported entries toward scan limits; they must not provide a way around resource bounds.

Enumerate every eligible selected directory independently of the UI's expanded nodes. Do not prune an include glob or text/status search simply because a directory name fails it: descendants may match. Preserve ignored paths and exclusion semantics explicitly; do not follow symbolic links or special files. Record unsupported/ignored exclusions in review diagnostics. A permission/read error, limit, cancellation, replacement or incomplete enumeration rejects the preview, never publishes a partial executable plan.

Capture each traversed directory's immediate child-name/type set and metadata observations. After traversal, re-enumerate the visited namespaces and compare names/types as well as retained entry identity/stamps. This catches additions/removals that SFTP second-resolution directory timestamps can miss. Validate ancestors and roots again at completion. This is still not an atomic remote filesystem snapshot: equal-attribute concurrent modifications can evade observations, so file digests and per-operation revalidation remain required.

## Map destinations and apply scope to the full inventory

Create a provider-specific recursive plan builder, rather than passing remote URLs into local `FolderService` scanners. Its inputs are native endpoint authorities, selected source paths, captured alignment/name-rule revision, and validated operation scope.

1. Capture source subtree coverage and ancestor context. Resolve manual directory alignment for each descendant through `counterpart`, including nested mappings and reserved destinations; reject displaced/unmapped sources explicitly.
2. Inspect destination mapped paths, their existing ancestors, and the directory namespaces needed to reject aliases and file/directory conflicts. Include target-only entries in paired inventory where needed for accurate status classification; Copy must never delete them.
3. For automatic name/filename matching, use the complete namespace discovery required by the existing matching model, then project the selected content. Uniqueness must not change because unselected/unexpanded files were omitted. Preserve the mapping signature and revalidate it before execution.
4. Build complete paired rows with actual parent links and all required ancestry. Reuse validated scope and `filterEntries`/`selectOperationEntries` semantics, including both mapped path names, query, status and comparison rules. Compute statuses from current provider comparisons under those rules, not cached UI colors. Digest only the regular files required by the final copy/recovery plan, while keeping full namespace coverage.
5. Project eligible files, eligible explicitly selected empty directories and necessary destination scaffolding. Existing local scope semantics intentionally treat directories as containers rather than applying file include globs directly to them; preserve those semantics with parity tests. Do not create every scanned directory if all its content was excluded and the directory itself was not eligible.

Before reusing local projection/scope helpers, introduce a clear provider snapshot adapter and endpoint-aware path validation. Keep local Windows reserved-name/ADS checks at local destinations. Allow remote Unicode/colon components without loosening traversal, NUL or separator checks. Do not globally relax local path validation to make remote names fit.

## Expand the retained plan and executor

Plan operations become `create-directory`, file create/replace/skip and, where required, `finalize-directory-metadata`. Keep actual source/target paths, selected/context/synthetic provenance and directory authority in private native state. Review exposes counts, bytes, overwrite destinations, excluded/skipped diagnostics and the exact scope. The existing plan dialog and Copy arrows remain the entry points; selecting a directory must no longer throw the current file-only explanation once the full path is verified.

Back up **all** overwritten files before creating directories or publishing files. Execute required missing directories parent-first using exclusive `mkdir`; if an unreviewed directory appeared, stop and request another preview instead of silently adopting its authority. Retain the identity of each directory this operation created, and pass updated validated parent authority to existing file writers. Do not compare pre-execution directory modification stamps after our own writes; compare identity/path plus expected operation-aware namespace changes.

New directories should initially permit the owner to write/traverse. Apply final source ordinary permissions and modification time only after children finish, deepest-first, so restrictive permissions do not prevent copying. Report unsupported ownership/ACL/xattr preservation honestly. A failed metadata-finalization step is a partial result, not proof that its files were never copied.

Cancellation must remain immediate during scan, content reads, backup, directory creation and file publication, including the existing pre-admission request nonce. On failure, preserve completed files and recovery data. Remove only known-owned, unchanged, empty scaffolding when appropriate; never recursively remove destination trees or claim rollback. Report directory and file outcomes as completed, skipped, failed, unknown or unattempted, and distinguish published-but-unverified files. Move/sync deletion is not implied by recursive Copy and remains a separate full-goal milestone.

## Implementation order and acceptance tests

First implement and test the selected-subtree inventory with fake and real local/SFTP providers. Then add the provider snapshot/mapping/scope adapter and read-only recursive preview. Next add directory publication/metadata finalization and extend the executor around existing file writers. Finally remove the runtime file-only restriction and verify the same UI on both Mac builds; actual Windows runtime verification remains separate.

Required cases:

- A collapsed `java/oracle/...` chain, nested regular files, empty directories, a directly selected file plus an overlapping selected ancestor; each eligible entry appears exactly once.
- Include/exclude/query/status rules, ignored subtrees and mapped filenames, with hidden descendants retained or excluded exactly like equivalent local Copy. An excluded destination-only file is never removed.
- Manual nested directory mappings, automatic name matching, duplicate filenames outside the selected subtree, reserved counterparts, Unicode/colon remote paths and Windows-invalid local destinations.
- New parent creation, existing-parent reuse, parent/file conflicts, case/NFC aliases, and a directory appearing between preview and exclusive mkdir.
- Changed namespace with restored directory timestamps, earlier-directory changes during later traversal, file content changes preserving size/mtime, symlink substitution and permission failure. No incomplete preview may execute.
- Entry/node/depth limits and Stop during held enumeration/read/backup, including queued cancellation. No later directory/file publication after acknowledged Stop except an already submitted publication reported with its correct outcome.
- Mixed local/remote and two remote servers, binary files above 10 MiB, all overwrite backups verified before first mutation, directory metadata ordering, middle-file failure, uncertain rename acknowledgement and safe retention of partial results.
- Existing selected-file Copy regression suites and native/UI lifecycle tests remain passing. The new feature is complete only when a user can select a folder, review its full eligible subtree and copy it through the existing controls.

## Adapter review findings

The provider adapter should return complete paired `rows`, eligible `selectedMappings`, `requiredDirectories`, `namespaceAuthority` and `coverage`. Reuse `ProviderFolderService.compareRows` for current encoding, normalization, timestamp and metadata rules, then scope selection; normalize its neutral directory status to `unchecked` while preserving metadata differences. Bind comparison eligibility observations to transfer review authority so a changed status cannot silently alter scope.

`discoverOperationAlignment` currently recognizes only `forSnapshots` implementations. `FilenameMatching` needs explicit reconstruction from full namespaces plus manual pairs/options; subtree-only matching is insufficient. Endpoint path policy must be consistent across scope, manual alignment and automatic matching. Keep existing local validation defaults; remote-name acceptance must never bypass local destination validation. Source-only exclusion pruning is not a substitute for paired endpoint filtering.

Do not feed the new nested provider metadata records directly into native snapshot projection: those helpers require local hash/revision/normalization contracts and specific alignment types. Build provider rows directly and keep the existing local planner intact.

## Selected-subtree inventory implementation

`desktop/provider-subtree-inventory.cjs` now exports `scanProviderSubtrees(provider, selections, options)`. Its frozen result contains scalar root/entry observations, normalized selections, ancestor context, complete child name/type sets, exclusions and coverage counts. It traverses selected descendants without consulting the UI, deduplicates overlaps, preserves empty directories, bounds observed ancestors and descendants, and never reads file contents. Namespace rescans precede the final metadata/root sweep.

Ten focused unit tests pass, along with six existing operation-scope tests and nine final real local/SFTP integration tests (terminal exit 0; `/private/tmp/fc-subtree-inventory-integration-final.log`). Integration covers both providers, restored-timestamp namespace changes, Unicode/colon names, skipped links, limits and held-enumeration cancellation. The module is not yet wired into Copy: the next step remains provider-aware complete pairing and filtered recursive review, followed by directory execution.

## Native comparison evidence

`folder-provider-comparison.cjs` now supports opt-in `captureEvidence:true` for native transfer review. Successful results include immutable scalar root/metadata observations and the exact raw/normalized hashes used for paired-file classification. Metadata/size/empty-file shortcuts also capture raw hashes when explicitly requested. Directory comparisons capture the actual metadata used by permission/owner/name rules with null digests. Failed comparisons publish no partial evidence. Ordinary browsing keeps its existing behavior and read costs.

This binds scope decisions to comparison reads: hashing before and after comparison alone could miss a temporary same-attribute remote change that is restored before the second hash. The recursive adapter checks comparison evidence against its retained scan and content observations before returning a reviewable inventory.

## Provider mapping and scope adapter

`prepareProviderCopyInventory` now constructs a read-only native inventory with paired rows, selected regular-file mappings, required directories, explicit coverage and matching authority. It currently scans complete bounded root namespaces even for manual/default mapping (50,000 entries per endpoint and 50,000 combined rows); this preserves reservations and filename matching outside the selected subtree at the cost of extra metadata IO. Content comparison is limited to selected source entries and their counterparts.

Matching is reconstructed from the complete namespaces; automatic filename pairs are not reused as manual reservations. Desired destination paths participate in filters, but synthetic destinations do not count as real files for newer/older criteria. Invalid unrelated projected names and parent conflicts do not block independent eligible selections. Native retained state binds endpoint references, namespaces, exact file bytes and actual comparison metadata; revalidation and explicit revocation are available. This is not yet an executable copy plan.

The shared matching and scope helpers now accept explicit native endpoint kinds, keeping strict local defaults and preserving remote path policy across swaps and renames. Local destination filename and alias validation remains separate.

Final adapter verification: 94 comparison/path-policy/alignment/matching/scope/inventory unit checks and 11 actual local/SFTP integration checks pass. Logs: `/private/tmp/fc-recursive-inventory-final-unit.log` and `/private/tmp/fc-provider-copy-inventory-integration-final.log`. Both completed with exit 0. Existing mapped/projection regression checks also passed during path-policy development. No package was rebuilt for this source-only milestone.

Destination exclusions are validated before returning the inventory: ignored folders, symbolic links and special files cannot be treated as absent targets or scaffolding. Planned local paths are also checked against each other for case/Unicode collisions, including ancestor directories.

## Directory creation and metadata primitives

`local-transfer-directories.cjs` and `sftp-transfer-directories.cjs` provide read-only preparation, exclusive creation and finalization through opaque, single-use native tokens. Missing parents must be created first. New directories begin with owner-only access; final ordinary permissions and modification time are applied deepest-first after their copied children finish. Existing directories are never adopted as newly owned tokens, removed or recursively rolled back.

Authority includes roots/parents and their ordinary identity/permission/owner observations. Finalization accepts a complete expected child namespace with names, kinds, identities and stamps. Local checks also detect directory stamp changes during child inspection. The final metadata check avoids reopening children after restrictive permissions are applied. Windows Unix permissions are explicitly unsupported; actual Windows runtime remains unverified.

SFTP path observations cannot distinguish same-attribute external replacement or close the final server-side race. Lost acknowledgement is reported as unknown; unknown creation carries `created:null`. Any submitted metadata failure may have changed attributes, even if the server returned a numeric failure. Confirmed creation or partial metadata writes are retained and reported. There is no automatic retry or deletion of uncertain results.

The helpers require the caller to complete the reviewed plan and all replacement backups before invoking mutation. The recursive executor and native integration now compose these primitives.

Directory validation: 45 focused directory/local-writer unit and filesystem tests pass (`/private/tmp/fc-directory-primitives-final-unit.log`). Twelve final real-provider tests pass, comprising nine SFTP directory cases and three composed local→SFTP, SFTP→local and SFTP→SFTP nested/empty-directory and binary-file transfers (`/private/tmp/fc-provider-directory-composed-integration.log`). Both processes exited 0. Fixture writer/text-save/transport regression checks also passed. These checks cover the primitive milestone; subsequent batch/UI validation is recorded below.

## Recursive batch executor

`provider-recursive-copy.cjs` now joins native inventory review, file observations, recovery backups and directory/file writers behind a retained single-use plan. The public operation sequence is parent-first `create-directory`, `copy`/`skip`, then deepest-first `finalize-directory`. All replacement recovery copies are completed and revalidated before the first destination mutation.

The recovery helper now accepts an explicit native `maxFiles` up to 50,000 for recursive batches while preserving its existing 1,000-file default. A 1,001-file test verifies one complete recovery manifest; indexed ownership lookup avoids quadratic backup verification. The 16 helper tests and 11 existing copy-backup/executor regressions passed. This does not add directory-entry crash durability.

Final executor verification passes: 60 focused source checks and 11 real local/SFTP integration cases. Native session/UI integration is now implemented in source; published 2.157.0 packages still contain selected-file Copy only.

Executor review fixes include retaining a verified publication when Stop/revocation arrives immediately afterward, keeping excluded namespace entries without following them, validating callback evidence before counting completion, and distinguishing operation-owned parent stamp changes from external permission/owner changes. Local root observations now include directory kind, mode and owner/group IDs for that distinction. Current-file ancestor checks and one final linear destination digest pass avoid rehashing the whole batch before every file.


## Native and renderer integration

Remote Copy now uses the recursive inventory and executor for selected files and folders, preserving active session, tree revision, endpoint path policy, matching, filters and cancellation authority. The native review reports copied files, new folders and identical files separately. New directory creation/finalization uses local or SFTP primitives according to the destination. All replacement backups precede mutation.

The native Electron suite passes collapsed mapped folders in local→SFTP, SFTP→local and SFTP→SFTP directions, including excluded descendants, nested binary files, empty folders, reviewed cancellation, exact destination verification, recovery records and replay rejection. Existing selected-file partial results and Stop/lifecycle tests also pass (`/private/tmp/fc-provider-recursive-copy-desktop.log`).

The renderer enables folder Copy through existing controls and groups folder metadata steps in the review. Results count file copies separately from directory operations and retain uncertain/partial results. History renders folder actions without null-source arrows and preserves metadata warnings; the actual browser persistence suite passes (`/private/tmp/fc-recursive-history-browser.log`). Actual Electron renderer verification passed, including collapsed-folder context/toolbar copy, cancel without mutation, exact nested/empty-directory results, file skips, partial failure and preview/execution Stop (`/private/tmp/fc-recursive-copy-ui.log`). Recursive review/result screenshots and light/dark result visuals were inspected. Shared local filtered merge/sync/copy/delete review regression also passed (`/private/tmp/fc-recursive-local-review-regression.log`). No release package has been rebuilt.


## Packaged milestone

Release 2.158.0 includes the recursive workflow. Both Mac architectures passed native Copy, actual UI Copy and remote text-origin/save suites with terminal exit 0. Archive integrity, packaged source/version/branding, app.asar archive equality and website downloads passed. See `release-2.158.0.md`. Actual Windows runtime remains open.
