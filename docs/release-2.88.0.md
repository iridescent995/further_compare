# Further Compare 2.88.0

Folder right-click Synchronize > Update both sides and native Actions > Synchronize > Update Both Sides preview a bidirectional update. Selected files are exact; selected folders include actual descendants and aligned endpoints. Newer and one-sided files copy to the other side, with no deletions. Current masks, query, status and comparison rules determine eligibility; the explicit all-contents override remains available. Byte-identical files are skipped. Different contents whose timestamps are within the configured tolerance, type conflicts and displaced alignment endpoints are listed for manual review rather than overwritten.

Preview lines and file-action history identify each copy direction. Overwritten files from both sides are backed up before destination writes. A single plan retains full snapshots and revalidates roots, ancestors, file identities and content. Case-normalized destination collisions are rejected before execution. New files use exclusive installation; existing destinations use backed-up atomic replacement. Copied file timestamps are preserved so repeated updates do not reverse direction. Partial failures report completed operations and backup location.

External-folder Copy and Move are grouped under Transfer to folder to retain the compact top-level menu. Existing opposite-pane copy/move remain directly available.

Validation: 62 related filesystem tests passed, including 19 new update tests for filters, alignment, selection ancestry, both-direction backups, timestamp ambiguity/preservation, stale plans, replaced ancestors, backup failure, mutations during copy and concurrent target creation. Independent review findings were fixed and the focused suite rerun. Source desktop tests passed for context/native previews, cancellation, actual mixed-direction copies, excluded-file retention, manual-review entries and repeat no-op. Compact menu geometry and external-folder copy regressions also passed. Package evidence is recorded in implementation-plan.json.

Full product parity and Windows runtime remain outstanding. This release adds the selected-entry bidirectional command; the Folder Sync session's existing Review changes mode remains directional mirror sync.

Final Apple Silicon and Intel bidirectional-update workflows passed. All three package versions and changed assets matched source; ZIP integrity and download links, sizes and SHA-256 checks passed.
