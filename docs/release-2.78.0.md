# Further Compare 2.78.0

Folder comparisons now offer **Refresh selected** in the right-click Compare submenu and native Actions menu. A mixed selection refreshes each selected folder's immediate contents and the selected file pairs without rescanning unrelated branches. Selected folders display their immediate children inline; unselected deeper folders stay closed.

Selected parents are processed before descendants. Files already covered by their selected parent are not compared twice, and descendants removed during the parent refresh are skipped. Selection and focus survive for entries that remain. Successful node results are retained if a later item fails, and stale session or rule results are rejected.

The command uses the focused pane's selection. Folders require Tree view. Type conflicts cannot be refreshed through this command. A standalone file whose identity changed or which disappeared still requires refreshing its parent through the existing native identity checks.

Source regressions passed mixed-selection refresh, exact IPC scope, native/context routes, deleted descendants, parent/file overlap, selection/focus and no extra tabs. Existing node and selected-file comparison regressions also passed. Final package verification is tracked in implementation-plan.json. Windows runtime acceptance and full product parity remain incomplete.

Both final Mac packages passed the selected-refresh and grouped context-menu regressions. All three package versions and changed assets matched source, archives passed integrity checks, and download links, sizes and SHA-256 were verified, including a Windows ZIP browser download.
