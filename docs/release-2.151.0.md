# Release 2.151.0 — Paired remote folder comparisons

Compare selected pair can open two remote directories, or a local and remote directory, in a child folder comparison. The child uses the existing compact tree, comparison colors, click selection and inline expansion. Nested child comparisons are supported.

Both selected roots are staged and revalidated before the child is published. Each child receives separate opaque connection handles. Closing an idle parent preserves its child connections; closing a child preserves the parent. Explicit disconnect revokes that session's providers even when another tab retains the underlying transport. Credentials are not copied into session files.

Concurrent child opens are rejected while another open is pending. Stop during metadata staging cancels the request without publishing a child. File/directory mismatches preserve the parent comparison.

Source registry, provider and Electron lifecycle checks pass. The visible right-click directory-pair action passes in source and both Mac packages, including child content and return to parent. Intel execution exceeded the test’s initial five-second publication limit; the bounded wait was raised to thirty seconds and all assertions passed. Directory-child, dialog, file-child and folder-lifecycle checks now pass on both Mac architectures. All three release archives pass integrity checks, packaged versions and changed assets match source, and download links, sizes, SHA-256 and the Windows browser ZIP download pass. Shipped desktop/web branding checks pass.

Transport-level cancellation still closes the shared connection, so affected tabs can require reconnecting. Remote saves, transfers, persistent connection profiles and automatic reconnection remain unfinished. Actual Windows runtime testing remains outstanding.
