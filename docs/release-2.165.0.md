# Version 2.165.0

SFTP folder comparisons now offer reviewed deletion of one regular remote file from the right-click menu, side toolbar and native Delete action. Review identifies the selected path and byte count; a native confirmation precedes execution. The app saves and verifies a local recovery copy before submitting deletion, then verifies that the remote path is absent.

Changed source content or enclosing folders invalidate the review. Cancel before submission leaves the file untouched. Connection loss after submission is reported as an unknown outcome with recovery details; the app does not retry or remove replacement content. Open child comparisons retain unsaved text while their old server-save authority is revoked.

SFTP v3 does not offer conditional deletion tied to the observed file identity/hash. External changes in the final interval before deletion remain possible; recovery contains the reviewed bytes.

Directory deletion, multi-file remote deletion and deletion on the local side of a mixed remote/local session remain unavailable. Existing fully local deletion is unchanged.

Validation:25 helper/unit and actual SFTP cases pass; native/UI/history, local filtered-operation and remote Rename regressions pass. Both Mac packages pass native and UI deletion. All three package ZIP/ASAR/source/version/branding checks pass. Actual Windows runtime remains unverified.
