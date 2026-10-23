# Folder workflow acceptance — 2.77.0

The current packaged Mac builds passed the original folder interaction checks: compact 23px rows; Name, Size and Last modified columns; no selection checkboxes; single-click selection; modifier multi-selection; and double-click opening one child comparison while preserving its parent session.

Both architectures passed live file colors and ancestor status propagation. The comparison queue tests passed on Apple Silicon and on an Intel rerun, verifying that unopened folders are not compared and unrelated settled nodes are not redundantly read. The new single-child chain behavior passed on both architectures as recorded in the release notes.

The Apple Silicon display regression additionally passed semantic filename colors, selected-row contrast in both themes, the native Display action and whitespace overlay theme updates.

Evidence: `test/folder-selection-desktop.cjs`, `test/folder-live-colors-desktop.cjs`, `test/folder-parent-status-desktop.cjs`, `test/folder-compare-queue-desktop.cjs`, `test/folder-chain-desktop.cjs`, and `test/display-desktop.cjs`.

One Intel queue-test run failed before entering the workspace because the launch screen remained hidden. The unchanged rerun passed, followed by three successful clean launches using `test/desktop-startup-desktop.cjs`. Startup diagnostics were added, but the intermittent failure's cause remains unconfirmed; this is not a verified startup fix.

Windows package contents have been verified, but native Windows runtime acceptance remains outstanding. This audit does not establish full product or context-menu feature parity.
