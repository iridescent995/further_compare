# Release 2.137.0 — Archive permission preservation

Archive edits and exports now retain ordinary POSIX read/write/execute permissions. Executable scripts keep their executable flag through copy, rename, child-editor writeback, and ZIP/TAR/TAR.GZ export. Native macOS/Unix file and folder imports capture permissions from the validated source snapshot. Windows imports omit synthetic POSIX modes.

Known Unix-host ZIP permissions and TAR modes are preserved, including explicit 000. Entries with unknown permissions use 0644 for files and 0755 for directories. Ownership, special permission bits, comments, signatures and original compression remain outside this preservation scope. Existing symbolic-link and special-entry rejection remains in place. Extraction still uses its existing private filesystem permissions; this change concerns archive metadata. Export dialogs explain preservation, and entry name tooltips show known octal permissions without adding columns.

Validation: 1,152 unit tests passed with one platform-specific skip. Independent Python ZIP/TAR fixtures and readers verify compressed and cross-format round trips, explicit zero versus unknown permissions, special-bit stripping, defaults and original content. Native imports reject permission changes during reads. Browser child-editor staging preserves edited and untouched modes; source desktop add-file, add-folder and TAR-export workflows pass, including undo/redo and saved-session reopening. Three ZIP integrity, package version/assets, download checksums and branding checks pass. Actual Windows runtime and broader archive metadata preservation remain open.

Both final Mac packages passed native file/folder import workflows with actual exported permission assertions.
