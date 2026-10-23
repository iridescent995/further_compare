# Release 2.112.1 — clean welcome-screen window title

Closing the final edited session after discarding its changes now clears the window title and active dirty indicator. Cancelling closure keeps the original dirty title and contents. Starting another comparison begins clean. The reset happens after the old tab snapshot, so saved tab state is preserved.

The live reference Actions menu was inspected again: Open/Open With, Quick Compare, Compare To, Align With, Compare Contents, copy/move/delete/rename, attributes/touch/exclude, new folder, copy filename, ignored state, refresh selection, reports and synchronization remain represented by existing workflows. This is an inventory comparison, not evidence of complete behavioral parity. The reference window screenshot was unavailable.

Current source regressions passed selection, Ctrl/Command and range selection, double-click opening, immediate-node comparison with no unrelated reads, single-child chain expansion and complete implemented context-menu inventory. Last-tab cancellation/discard and native title regression passed. Both actual Mac packages passed the last-tab/native-title workflow. Package versions and UI bundles match source; all three ZIP integrity checks, download links, sizes, SHA-256 and Windows ZIP browser download passed. No reference branding was found in shipped source. The context-menu test printed all assertions passed but required SIGTERM of its isolated Electron child during stalled cleanup; it then exited successfully.

Full-product scope, Windows runtime and the intermittent archive reimport stress issue remain open.
