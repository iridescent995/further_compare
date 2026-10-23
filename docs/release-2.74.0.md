# Further Compare 2.74.0

File action history is available from folder right-click → Reports and the native View menu. It records applied-plan attempts for copy, move, delete, merge and sync, distinguishing Completed, Cancelled and Failed. Each entry captures the session name, timestamp, comparison roots, preview description/filter scope, planned paths, reported completion count and backup location when returned by the native operation.

History stays in memory for this app run. It keeps the latest 100 attempts, with at most 100 paths and 32 KiB of path text per attempt. Longer lists explicitly show that paths were omitted. Export JSON downloads the captured history; Clear history affects only the log. It does not record rename, timestamp edits or three-way-folder output operations yet.

Failed execution now closes its stale preview before refreshing the comparison. The failure remains in history and prompts the user to inspect files and backups before retrying; no automatic rollback success is claimed.

The source regression exercised five real filtered operations, cancellation, a stale-preview rejection, generated JSON export, and clearing while checking filesystem results. Both final Mac packages passed the extended workflow. Light/dark screenshots were inspected and layout checks prove the list does not overlap its buttons. All three package versions and changed renderer/style/native files match source; ZIP integrity, download links, sizes and hashes passed.

Full product parity and native Windows runtime verification remain incomplete.
