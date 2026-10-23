# Release 2.153.0 — Saved SFTP profiles

The connection dialog can save named server profiles, load them, update them and delete them. Profiles contain only name, host, port, username and folder, plus an internal identifier. Passwords, private keys, connection handles and host-key approvals are not stored. Connecting still requires fresh credentials and explicit key review.

The native profile store validates every field, supports up to 100 profiles, serializes mutations and writes through atomic replacement. Invalid or unsupported stores are reported rather than silently overwritten. Profiles and their deletion persist across application restarts. The controls use the existing pastel styling with reduced field spacing.

A late cleanup from a cancelled connection no longer clears the password of a newly reopened dialog. Profile loads and saves also check that their dialog is still current before updating it.

Source unit, browser and desktop persistence tests pass. Both Mac packages pass profile save/restart/load/update/delete, the actual SFTP dialog and paired/nested remote directory workflows. All three archives pass ZIP integrity, bundled versions and changed assets match source, and download links, sizes, SHA-256 and the Windows ZIP browser download pass. Shipped desktop/web branding checks pass.

Persistent host trust, key-file authentication UI, automatic reconnect, remote original-file saves and reviewed transfers remain unfinished. Actual Windows runtime remains unverified.
