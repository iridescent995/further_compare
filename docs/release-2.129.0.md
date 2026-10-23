# Release 2.129.0 — Match files with different extensions

Added an optional filename rule in Pairing & alignment, reachable through native and right-click Filename Matching options. It pairs files such as settings.json and settings.yaml within corresponding folders. Exact and case/Unicode full-name matches take precedence. Only unique remaining stems pair; directories and ambiguous stems stay separate. The rule strips the final extension and preserves actual filenames.

The policy applies to lazy folder browsing and unopened-descendant operation previews, including actual destination paths, backups, and stale namespace rejection. Sessions, defaults, swaps and reports retain the setting. Automatic pairs remain separate from manual alignments.

Validation so far: 1,074 unit tests passed with one Windows-only skip. Source desktop extension and existing case/Unicode workflows passed, including lazy expansion, selection/open behavior, actual-path copying, backups, persistence, defaults and opt-out. Both final Mac packages passed the native extension workflow. All three ZIPs passed integrity checks; packaged versions, changed modules and final renderer assets match source. Download links, sizes, SHA-256 checksums and browser Windows download passed. Shipped branding checks are clear.

Actual Windows runtime testing and the remaining full-product scope are still open.
