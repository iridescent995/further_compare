# Release 2.154.0 — SSH private-key authentication

SFTP connections now offer password or private-key sign-in. The native key picker accepts regular files up to one MiB; the dialog displays only a basename and an opaque selection ID. Encrypted keys accept an optional passphrase. Key material stays native, expires, and is cleared after use, replacement, discard or session disposal.

Key selections are bound to their native session and consumed once. A late file picker cannot revive authority after its session closes. Server-key review is still required before authentication. Profiles continue to exclude private keys, passphrases and trust approvals.

Source helper, browser and Electron tests pass, including generated plain/encrypted keys, ownership and replay rejection, cancellation, session cleanup, both remote folder sides and existing password/profile regressions. Both Mac packages pass all four suites: key authentication, profile persistence/restart, actual dialog/reconnect and session lifecycle. All three archives pass ZIP integrity; bundled versions and changed assets match source. Download links, sizes, SHA-256 and the Windows ZIP browser download pass. Shipped desktop/web branding checks pass.

Persistent host trust, automatic reconnect, remote original-file saves and reviewed transfers remain unfinished. Actual Windows runtime remains unverified.
