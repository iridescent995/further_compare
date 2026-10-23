# Release 2.158.0 — Recursive local and SFTP folder copies

Status: archives/downloads verified; packaged Apple Silicon and Intel workflows pass.

Selected folders can now be copied between local and SFTP roots in either direction, or between SFTP roots, using the existing pane arrows, toolbar and right-click menu. Collapsed folders include their eligible descendants. Review honors mapped paths, filename matching and file-action filters, includes nested and empty folders, and skips identical files. Local-only operations retain their existing behavior.

The review separates files to copy from folders to create and groups folder metadata steps. Results and history distinguish file copies, folder creation, metadata updates, skipped files, partial completion and uncertain outcomes. Stop works during preview and execution. Plans remain tied to the reviewed session, roots and tree revision and cannot be replayed.

All replacements receive verified local recovery copies before destination mutation. New directories are created parent-first with restrictive initial permissions; ordinary permissions and modification time are finalized deepest-first. Exact destination content is verified before final folder permissions. Existing destination directories are retained. Ownership, ACLs and extended attributes are not preserved. SFTP cannot eliminate concurrent external modification races or reliably identify same-attribute path replacement. Unknown outcomes are reported without automatic retry or deletion. Recovery directory-entry crash durability remains unfinished.

Source checks include 60 focused executor/inventory/provider checks, 11 real-provider recursive integrations, native Electron transfers in all three directions, actual renderer collapsed-folder copy, review cancellation, partial failures and Stop, browser history persistence and local filtered-review regressions. Recursive review/result and light/dark screenshots were inspected.

All three ZIP archives pass integrity checks and contain the verified app.asar. Packaged versions are 2.158.0; desktop/dist source equality and shipped branding checks pass. Actual Windows runtime remains unverified. Remote move/mirror, session restoration and broader full-product parity remain unfinished.

Packaged Apple Silicon and Intel native recursive Copy, actual renderer Copy and remote text-origin/save suites all passed with exit 0. Logs: `/private/tmp/fc-2.158-arm64-final.log` and `/private/tmp/fc-2.158-x64-final.log`. Download link, content length, SHA-256 and Windows ZIP browser download checks passed (`/private/tmp/fc-2.158-downloads-check.log`).
