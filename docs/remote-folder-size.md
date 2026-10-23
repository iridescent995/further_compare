# Remote folder size

The Properties dialog gains on-demand metadata-only recursive sizing for SFTP folders and the local side of mixed comparisons. Initial Properties reads remain nonrecursive. Totals count regular-file bytes, not disk allocation; folders count descendants, excluding the selected root. Symlinks and special entries are skipped without following them.

Each scan has a 50,000-entry, 5,000-directory, 256-level and 10-second bound. Limited or skipped traversal is explicitly partial. File byte totals use bigint strings to avoid aggregate precision loss. A provider deadline aborts outstanding requests and preserves only counted partial totals. User cancellation rejects the result. SFTP cancellation may close the affected transport, requiring reconnection.

Native scan authority is bound to the current Properties request, session, service, tree revision, side, selected ID and endpoint. Closing Properties, replacing roots, switching sessions or closing a session cancels the corresponding work. Duplicate scans of one entry are rejected. No file contents are downloaded or modified.

This is a bounded metadata total, not an atomic filesystem snapshot. SFTP cannot detect all same-attribute external replacements. Deadline partial results may not receive final metadata revalidation and must not be presented as complete.

Status: packaged in 2.159.0. Source helper, native and actual Properties UI verification passed on both Mac architectures. All three release archives and downloads are verified; actual Windows runtime remains pending. See release-2.159.0.md.

Verification: 14 helper/local-size checks pass. The native SFTP suite passes exact/empty totals, skipped links, zero content IO, mixed-local totals, request authority, held READDIR cancellation/session close, and a real 10-second deadline preserving 10 counted bytes (`/private/tmp/fc-sftp-size-native.log`). Actual Properties UI calculates 23 bytes without file OPEN/READ and Close cancels a held scan (`/private/tmp/fc-remote-size-ui.log`). Existing local Properties UI passes (`/private/tmp/fc-remote-size-local-regression.log`). Screenshot inspected: `/private/tmp/fc-remote-folder-size-ui.png`.
