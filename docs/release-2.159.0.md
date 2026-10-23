# Release 2.159.0 — Remote folder size

Status: all archives/downloads verified; both Mac packaged workflow sequences passed.

Properties now offers Calculate folder size for SFTP folders and local folders in mixed comparisons. The initial Properties request remains nonrecursive. Calculation traverses metadata, counts regular-file bytes and descendant directories, and skips symbolic links and special entries without following them or downloading contents.

Scans stop at 50,000 entries, 5,000 directories, 256 levels or a 10-second deadline. Limited scans and skipped entries are explicitly partial. Deadlines retain the bytes already counted; cancellation discards the result. Closing Properties, replacing roots, switching sessions or closing a session cancels the corresponding work. Cancellation of remote requests can close the affected transport, requiring reconnection.

Size requests are bound to the current session, roots, tree revision, selection and Properties request. Duplicate scans of the same entry are rejected. Totals use bigint strings. These are bounded metadata totals, not atomic snapshots; SFTP cannot detect all same-attribute external replacement. Deadline partial results may not receive final metadata validation.

Source verification includes 14 helper/local-size checks, actual native SFTP exact/empty totals, skipped links, no file-content reads, mixed-local totals, stale requests, held READDIR cancellation and session closure, plus a real 10-second timeout preserving a partial total. Actual Properties UI calculation and Close cancellation pass, and existing local Properties regressions pass. Screenshot inspected.

Actual Windows runtime and broader full-product features remain unfinished.

Apple Silicon and Intel native Properties/size, actual SFTP dialog and recursive Copy tests all passed with terminal exit 0 (`/private/tmp/fc-2.159-arm64-final.log`, `/private/tmp/fc-2.159-x64-final.log`). ZIP integrity and embedded app.asar equality, packaged version/source/branding and download links/content lengths/SHA-256/Windows browser download checks all passed. Windows runtime remains unverified.
