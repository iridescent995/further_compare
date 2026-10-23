# Remembered SFTP server keys

The server-key review offers **Remember this server key on this device**, unchecked by default. After successful sign-in, the app saves only the normalized host, port and SHA-256 host-key fingerprint. Passwords, private keys and passphrases are never included. Connection profiles and comparison sessions remain separate from this device-local record.

A later review identifies a matching saved key or shows the previous fingerprint when the key differs. Explicit recognition and fresh credentials are still required for each connection. Remembering a changed key is separately labeled **Replace the saved key after successful sign-in**. Leaving it unchecked uses the approved key for the current connection without replacing the saved record.

**Forget saved key** removes the reviewed record and consumes that review. Review the server again before connecting. The action does not disconnect existing connections.

Native review tokens bind approval to an endpoint, fingerprint, owner and expiry. Authentication verifies the exact reviewed fingerprint. Saving checks that the previously reviewed record has not changed, then uses staged publication and verifies the result. Failed authentication never saves trust. Observed concurrent changes, corrupt data and symbolic-link stores fail closed; POSIX stores require mode 0600. The store is limited to 1,000 hosts and 512 KiB.

Cancellation checked before publication prevents an uncommitted change. Once publication has begun, cancellation may leave the explicitly approved fingerprint saved while preventing connection registration. Existing-file replacement retains the shared local saver's narrow final validation-to-rename race; this is not a cross-process atomic compare-and-swap guarantee. The format is application-specific and does not import or modify OpenSSH known_hosts files. Automatic reconnection remains pending.
