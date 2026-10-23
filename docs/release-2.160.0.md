# Release 2.160.0 — Saved remote sessions and workspaces

Status: all archives/downloads verified; both Mac packaged workflow sequences passed.

Folder sessions and workspaces can now save SFTP endpoint descriptions alongside local roots, filters, comparison settings and alignment. Reopening restores remote sides disconnected. Reconnect prefills host, port, username and root and uses fresh server-key review and authentication. Opening a saved comparison performs no remote connection or request. Cancelling reconnect leaves the saved side available for retry.

Saved descriptions contain no credentials, private-key paths, fingerprints, approval tokens, connection IDs or server-save tokens. Native save derives locations from actual native connections or retained disconnected descriptions. Remote paths are never staged as local filesystem paths. Disconnected folders cannot serve as missing destinations for file operations.

Matching-endpoint reconnect preserves manual alignment; changing an endpoint clears it. Swapping, local replacement, session reset and closure maintain the correct pending state. Separate runtime tab snapshots retain live connections across tab switches. Saved workspace initialization preserves staged settings instead of applying new-session defaults. Reopened remote text snapshots do not regain server-write authority.

Source verification includes 59 schema/session/workspace/alignment checks; native remote session/workspace round trips, descriptor authority, swap and replacement; adversarial pending-operation guards, remote colon-path alignment, stale reconnect rejection and changed-endpoint reset; actual UI reconnect/cancel, filters, live-tab preservation and mixed workspace restore; existing workspace and clear-session regressions. The disconnected-state screenshot was inspected.

Actual Windows runtime, remote move/mirror and other full-product gaps remain unfinished.

Apple Silicon and Intel each passed native remote session, adversarial authority/alignment, actual remote session/workspace UI and existing workspace suites with terminal exit 0 (`/private/tmp/fc-2.160-arm64-final.log`, `/private/tmp/fc-2.160-x64-final.log`). All three ZIP integrity/app.asar equality, packaged source/version/branding and website download link/size/SHA-256/Windows download checks passed. Actual Windows runtime remains unverified.
