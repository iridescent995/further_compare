# Release 2.152.0 — Reconnect remote folders

Existing SFTP folders now offer Reconnect in their path controls and Navigate context menu. The dialog fills the current host, port, username and folder. A password must be entered again and the server key reviewed before authentication. Opening a new connection clears previous endpoint fields.

Cancellation and failed preparation or authentication preserve the existing comparison. After successful replacement, the old session handle is released if no other root uses it. Retained child tabs keep their independent connection handles. Safe connection descriptors include username, but no password, private key or approval token.

Source browser and native lifecycle checks pass. Both Mac packages pass all four runtime suites: dialog reconnect (including incorrect-password preservation and reconnect after disconnect), directory-child replacement lifetime, folder attachment and session lifecycle. All three archives pass ZIP integrity; versions and changed assets match source. Download links, sizes, SHA-256 and the Windows ZIP browser download pass. Shipped desktop/web branding checks pass.

This release supports manual reconnect for the selected side. Persistent profiles, key-file authentication UI, automatic recovery of related tabs, remote saves and reviewed transfers remain unfinished. Actual Windows runtime remains unverified.
