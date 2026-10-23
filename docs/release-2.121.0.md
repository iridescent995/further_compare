# Release 2.121.0 — Optional persistent file action history

File action history now offers Keep history between app runs. Retention is off by default. Enabling it saves current entries and subsequent attempts on this computer; disabling it removes the saved entries while retaining the current window's in-memory list. Clear history preserves the retention setting and does not delete files or backups. Opening history refreshes entries from other windows. JSON export is retained.

The shared native store keeps at most 100 attempts, with up to 100 paths and 32,768 path characters per attempt. UUID deduplication prevents duplicate records, and equal-time entries retain newly appended attempts. Writes use private temporary files and atomic replacement, with serialized updates across windows. Reads are bounded and reject invalid, corrupt, symbolic-link or hard-linked stores rather than silently replacing them. A failed save remains visible in the current window with an error message. History is an action log, not a crash-recovery journal.

The history dialog uses borderless rounded styling. The existing rename test was corrected to expand the parent once, matching automatic sole-child chain expansion.

Validation: 973 unit tests pass with one Windows-only skip. Browser checks cover delayed initial reads, queued appends, failure retention, focus restoration, migration, clearing and opt-out behavior. Source native checks cover four app launches, actual renames, retained/removed records, JSON export and multiwindow clearing without changing file contents. Existing rename, timestamp and patch-history checks pass. Light/dark rendering was inspected.

Both Apple Silicon and Intel packages pass the full restart and multiwindow native workflow. All three release ZIPs pass integrity checks; versions, renderer/CSS and changed native modules match source. Download sizes, SHA-256 and the Windows browser download pass, as does the shipped-source branding check. Windows runtime and full-product scope remain open.
