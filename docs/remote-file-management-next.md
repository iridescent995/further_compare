# Remaining remote file-management work

Current package: 2.160.0. Reviewed file/folder Copy, remote text save, Properties/size and saved remote session/workspace restoration are implemented. In that package, Rename, Move, Delete and Mirror remain disabled for remote roots. Source now enables reviewed single regular-file Rename; Move, Delete, Mirror and remote directory rename remain pending.

Next implementation milestone: reviewed single regular-file rename within one SFTP endpoint and parent, to an absent name. A retained single-use plan must bind endpoint/root/parents, source metadata and hash, and target absence. Before submission, create verified local source recovery, revalidate, then use ordinary no-overwrite SFTP rename. Verify source absence and target contents afterward. Record definite rejection, acknowledged verification failure and unknown outcomes separately. Stop or connection loss after submission must not trigger retry or target cleanup.

SFTP v3 has no conditional path mutation tied to the observed identity. Same-attribute source replacement and the final observation/mutation race remain possible; do not claim compare-and-swap guarantees. Transport support exists in sftp-connection.cjs, while provider identities are deliberately weak. Reuse provider-transfer-backup.cjs and file snapshots; native session/tree ownership and UI result patterns come from reviewed Copy.

Later Delete requires independent source-removal review and recovery, not just a hash check before unlink. A quarantine design may improve recoverability but still cannot eliminate source-selection races. Cross-endpoint Move must not interpret successful Copy as authority to delete the current source path; represent copied/source-retained partial outcomes explicitly. Mirror requires an independent destination-removal inventory, complete coverage, exclusions/alignment, recovery for every removed file and deepest-first folder removal. Copy selection alone is not deletion authority.

Required rename tests: destination appearance, source/parent changes, cancellation before/after submission, lost acknowledgement including status6/7, incorrect post-rename bytes, stale/revoked plans, verified recovery and preservation of uncertain outcomes. No rename implementation is included in 2.160.0.


## Verified rename helper

`desktop/sftp-file-rename.cjs` implements `prepareSftpRename`, `executeSftpRename` and `revokeSftpRename` with private retained plan authority. Source recovery precedes submission. Successful verification requires source absence, exact target bytes/metadata and stable root/ancestor identity/permissions; own rename stamp changes are allowed after acknowledgement. Error fields retain submission/acknowledgement/renamed status and recovery paths. The final 23 focused and actual SFTP cases passed (`/private/tmp/fc-rename-helper-final.log`). Native review, context/F2 UI, history/results and remote child authority invalidation now pass source integration tests. The shipped 2.160.0 app does not enable remote Rename.

## Related tab-state correction

Review found that local directory rename remapped saved tab descriptors but missed the new runtimeFolders snapshot. The old bundle reproduced an inactive nested tab reverting to the old root. Source now remaps both; the targeted repeated-switch test and existing full local rename test pass. Logs: `/private/tmp/fc-rename-tab-state-before.log`, `/private/tmp/fc-rename-tab-state-after.log`, `/private/tmp/fc-rename-local-regression.log`. Packaging remains pending.

## Verified native and UI integration

The rebuilt source passes `test/sftp-rename-desktop.cjs` and `test/sftp-rename-ui-desktop.cjs`. Tests cover reviewed cancellation, verified recovery and rename, selection, alignment, queued/held cancellation, stale sessions, pending/directory guards and lost acknowledgement. Affected open child tabs preserve unsaved text while their old save authority is invalidated; unrelated child saves remain valid. Logs: `/private/tmp/fc-sftp-rename-native.log`, `/private/tmp/fc-rename-ui.log`. UI result capture: `/private/tmp/fc-remote-rename-result.png`.

The operation history browser test verifies unknown rename and acknowledged-but-unverified outcomes. Both local rename and inactive nested-tab rename regressions pass against the integrated source. Packaging and actual Windows execution remain unverified for these changes. Local-side file and folder rename in mixed remote/local comparisons now passes native and UI tests, preserving remote roots, manual alignment and local child paths.

## Background-read coordination correction

Initial 2.161.0 Intel UI verification exposed a real race: `FolderTree.withOperation` aborted a background comparison, which closed the shared SFTP transport before Rename began. Diagnostic evidence is in `/private/tmp/fc-rename-ui-diagnostic.log`. Source now tracks outstanding requests separately and allows remote Rename/Copy to drain them under a lock before revalidating generation, revision and root authority. Explicit Stop remains cancellable.

All 35 folder-tree tests pass, including held-read draining, changed-root rejection and Stop. Deterministic real SFTP tests hold a comparison READ while Rename/Copy starts, verify no mutation or connection closure, then release it and verify exact successful bytes. Full native suite and source remote Rename UI pass (`/private/tmp/fc-sftp-rename-read-drain.log`, `/private/tmp/fc-rename-ui-drain-fix.log`). Existing 2.161.0 archives predate this correction and must be rebuilt and retested. Latest fully verified packaged release remains 2.160.0.

## 2.162.0 packaged verification

The corrected runtime is now packaged. Apple Silicon and Intel each pass native remote Rename (including held-read Copy/Rename coordination and mixed local-side rename) and the real Rename UI that previously failed on Intel. Text-copy and idle-toolbar suites also pass on both. All three ZIPs, bundled source/version/branding and website download hashes pass. Logs: `/private/tmp/fc-2.162-{arm64,x64}-gates.log`, `/private/tmp/fc-2.162-{arm64,x64}-ui.log`, `/private/tmp/fc-2.162-package-check.log`. This supersedes the earlier 2.161.0 packaging caveat. Actual Windows runtime and remote directory rename/move/delete/mirror remain open.

## 2.165.0 single-file deletion

Reviewed deletion of one regular SFTP file is now implemented. It retains a single-use native review, enforces operation filters before review and again after confirmation, drains comparison reads, verifies local recovery before one unlink, and distinguishes rejection, unknown outcome and acknowledged verification failure. Submitted deletion invalidates matching child save tokens without discarding editor text. Context/toolbar/native routes are enabled for that supported selection only. Directory deletion, multi-file deletion, remote Move and Mirror remain unfinished.

Source verification: 25 helper/unit and real-SFTP tests pass, plus native deletion, UI deletion, persistent history and existing remote Rename regression. Packaging evidence follows final gates.
