# Saved remote comparisons

Saved folder sessions and workspaces support optional `remoteFolders` side descriptions. Each SFTP description contains only protocol, host, port, username and root. Local folders stay in the existing `folders` fields. A side cannot be both local and remote; credential material, key paths, fingerprints, approval tokens and connection IDs are rejected from the remote schema.

Opening stages local paths and restores remote descriptions in a disconnected state. No network requests are issued, remote paths are never opened as local filesystem paths, and saved descriptions confer no file-operation or server-save authority. Folder comparison and actions wait until saved remote sides reconnect. The existing connection dialog prefills nonsecret fields and requires fresh host review and credentials. Cancel leaves the description available for retry.

Native save derives endpoints from live native connections or retained disconnected descriptions, never renderer-supplied paths. Per-tab live snapshots are separate from persisted descriptions so switching tabs retains active connections. Swap, local replacement, reset and close update the retained descriptions. Matching-endpoint reconnect preserves manual alignment; changing the endpoint clears it. Automatic matching is rebuilt from current provider contents.

Status: packaged in 2.160.0. Source schema, native authority/alignment tests and actual session/workspace UI pass; both Mac packaged suites and all archives/downloads are verified. Actual Windows runtime remains open. See release-2.160.0.md.

Evidence: 59 schema/session/workspace/alignment checks, including ten new remote schema tests (`/private/tmp/fc-remote-session-schema.log`); native no-network restore, native endpoint authority, reconnect, workspace, swap and local replacement (`/private/tmp/fc-remote-session-native.log`); actual UI disconnected restore/save, prefilled reconnect/cancel, fresh review, filters and live tab preservation (`/private/tmp/fc-remote-session-ui.log`); existing workspace and clear regressions (`/private/tmp/fc-remote-session-workspace-regression.log`, `/private/tmp/fc-remote-session-clear-regression.log`). Disconnected screenshot inspected.

Adversarial native verification passed: disconnected-operation blocking, native description/alignment authority, remote colon-path mapping preservation on matching reconnect, inactive workspace capture, stale staged reconnect rejection and mapping reset after endpoint change (`/private/tmp/fc-sftp-session-authority.log`).

Actual mixed-workspace UI coverage exposed default-rule mutation during initialization of an already staged saved context. Workspace creation now explicitly skips new-session defaults/native rule updates; saved options and alignment remain staged until restoration. Ordinary new/child sessions retain defaults. Final remote and local workspace UI reruns both passed with exit 0.
