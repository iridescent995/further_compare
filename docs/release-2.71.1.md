# Further Compare 2.71.1

Merge and sync context menus now group Review changes inside Direction. All three folder modes stay within 22 top-level menu items. Both directions and preview behavior remain available.

The source build and final Apple Silicon and Intel Mac packages passed the direction/context regression, including successful copy/delete previews, selection/focus preservation, stale-menu rejection and unchanged fixture files. Package versions and UI bundles match the source across both Macs and Windows. ZIP integrity, local download links, sizes and SHA-256 checks passed.

The original folder acceptance checks also passed against the preceding Apple Silicon package. Live-color test setup now waits for the new session and completed folder selection, eliminating a setup race without relaxing assertions. See folder-workflow-audit-2.71.1.md.

Native Windows verification and full product parity remain incomplete. Direct reference-app inspection was retried after the user confirmed unlocking, but computer control still reported the Mac locked.
