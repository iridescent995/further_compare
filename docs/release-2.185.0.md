# Further Compare 2.185.0

SFTP server-key review can now remember an approved fingerprint on this device. The option starts unchecked. Later reviews identify a matching key and show the saved fingerprint when a server's key changes. Replacing a saved key requires separate explicit consent and successful authentication. **Forget saved key** removes the reviewed record and requires a fresh review before connecting.

Credentials remain transient. The native store contains only host, port and fingerprint, with strict bounded validation, private POSIX permissions, observed-concurrency checks and staged publication. Failed authentication does not save a key. See [remembered SFTP keys](sftp-remembered-keys.md) for cancellation/publication limits and format details. Automatic reconnection remains pending.

The review step hides the inactive profile and endpoint inputs, keeping the sign-in and review controls compact. Existing connection/reconnect checks passed after correcting stale test expectations for previously implemented remote rename/delete support. The complete unit suite passed 1,938 tests with one skip; focused browser and real native tests passed opt-in, cancellation, failed authentication, app restart, key changes and forgetting.

Windows runtime testing remains deferred. Dynamic Finder and Explorer menus remain pending; the current Mac environment has no signing identity for a distributed Finder extension.

Both Mac packages passed the full persisted-key workflow, including app restart and forgetting. All three packages passed source/branding, ZIP integrity and download checks. The installed Apple Silicon app matches verified package bytes and Finder service registrations remain valid. Version 2.184.0 is retained for rollback.
