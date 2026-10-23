# Release 2.150.0 — Remote folder reading and comparison

Desktop folder comparisons now have a Remote connection option on each side and in the right-click Navigate menu. SFTP connections require explicit host-key fingerprint review before password authentication. Credentials remain transient; trusted keys are session-local. Local/remote and remote/remote pairs use the same compact tree, lazy node comparison, colors and selection behavior.

Double-clicking remote files opens staged text or data copies in the existing editor. Both inputs are bounded and revalidated before a child tab is created. Text sources show server-qualified addresses; Save As writes a local copy. Remote original-file saving, uploads/downloads, persistent connection profiles/trust, session restoration, and paired-directory child sessions remain unfinished.

Remote context menus keep supported comparison, selection, clipboard and loaded-row report actions available. Unimplemented actions are disabled with explanations. Copy paths emits encoded server-qualified URLs. Right-click Stop now uses the same explicit cancellation path as the toolbar, fixing queued comparisons continuing after stopping expansion.

SFTP metadata and file reads support cancellation and cleanup across Stop, root changes, tab changes during child opening, session reset/close and window disposal. Attachment uses cancellable preparation followed by a synchronous checked commit. Weak SFTP metadata is not treated as inode identity and does not enable persistent hash reuse.

Packaged testing exposed attachment incorrectly rejecting normal background activity. Root and child publication now join the native transaction queue after network staging; a deterministic held-picker regression verifies that preparation proceeds and publication waits. Reusing a connection with an active child read is rejected before replacing its root.

Packaging uses the JavaScript fallbacks of the SSH transport's optional native accelerators; dependency rebuilding is disabled for consistent cross-platform archives. The source suite and real Electron workflows have passed. All five packaged SFTP workflows pass on both Apple Silicon and Intel Macs: transport, session lifecycle, folder attachment/comparison, child-file opening and the actual connection dialog. The final local busy-context regression also passes on both Mac packages, including queued actions, selection, double-click/Enter, inline expansion and immediate Stop. All three archives pass ZIP integrity; packaged versions and changed desktop/UI assets match source. Download links, sizes, SHA-256 and the Windows ZIP browser download pass. Shipped desktop and web assets contain no reference-product branding.

Actual Windows runtime verification remains outstanding.
