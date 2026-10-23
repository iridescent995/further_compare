# Release 2.156.0 — Save text to SFTP servers

Status: packaged and verified on Apple Silicon and Intel Macs. Windows archive built and checked; Windows runtime remains unverified.

Remote text comparisons now offer Save to server in the path bar, File menu and path context menu. Save As still creates a local copy. A native review shows the destination, encoding and byte count before writing. The opened raw bytes are hashed, and the server file is reread before staging and replacement so observed external changes are rejected even when size and timestamp are unchanged.

The save uses an exclusive temporary sibling, bounded writes, staged-byte verification, ordinary POSIX permission preservation and an advertised atomic rename extension. Fsync is used when supported. Unsupported servers retain local-copy functionality. An interrupted rename reports an unknown outcome; failed verification after an acknowledged replacement is reported separately. SFTP does not provide conditional content replacement, so a concurrent writer in the final check/rename interval cannot be ruled out. Ownership, ACLs and extended metadata are not preserved by this implementation.

Text children retain their own connection leases, allowing saves after the parent folder tab closes. Native source tokens bind the session and side. Local replacement, local Save As and Clear revoke the old source. Swaps preserve side routing, and newer edits made during a save remain unsaved. Clear is disabled while a save is in progress. Compact path buttons retain their width without overlapping labels.

Twelve helper tests, 32 transport/provider/write tests and 11 provider-open tests pass. Native tests verify parent closure, cancellation, repeated saves, equal-size/equal-time stale-content rejection, token invalidation and final cleanup. Existing remote file/directory workflows pass. Actual UI tests verify UTF-8 and UTF-16 BOM bytes, native review, context actions, repeat saves, tab restoration, swapped sides, newer edits, stale-source rejection and local-copy revocation. Light/dark layouts were inspected.

Remote file opening now waits for an in-flight background comparison before native row resolution, retaining selection and Stop checks. A deterministic test held a comparison read, reproduced premature open IPC in the old bundle, then passed on corrected source with exactly one open after release.

The corrected final packages pass remote-save UI (including deterministic open overlap), native origin/save lifecycle and existing child-file suites on both Mac architectures. All three archives pass ZIP integrity and packaged-source/version checks. Refreshed download links, sizes, SHA-256 values and the Windows ZIP browser download pass. Shipped desktop/UI branding scan is clear.

Final Mac evidence: `/private/tmp/fc-2.156-arm64-final-save.log` and `/private/tmp/fc-2.156-x64-final-save.log`. Actual Windows runtime, remote transfers, remote-session restoration and broader product parity remain unfinished.
