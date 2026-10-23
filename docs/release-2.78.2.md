# Further Compare 2.78.2

Refresh selected now recovers folders that were deleted, replaced or changed type outside the application. It rechecks the selected folder itself before comparing its immediate contents. Stale loaded descendants are removed when the folder identity changes; unchanged folders retain their loaded descendants. Type-conflict rows can be refreshed again after the conflict is resolved.

The native operation processes selected ancestors first, revokes obsolete child rows, and retains root, ancestor, symlink and concurrent-request validation. Unselected branches are not listed or compared by the command.

All 558 unit tests passed, along with the existing source selected-file comparison and node-refresh regressions. Final desktop and package evidence is recorded in implementation-plan.json. Windows native runtime acceptance and full product parity remain incomplete.

The expanded source desktop regression passed deletion/replacement of loaded folders, folder-to-file conversion and conflict recovery through native/context commands, checking exact IPC scope, descendant removal, selection/focus and unchanged unrelated branches. Two concurrent test runs became unresponsive, including their debugging channels; after process sampling and scoped termination, a single instrumented run passed. The control-channel stall's root cause is unconfirmed.

Both final Mac builds passed the full recovery regression sequentially. All three package versions and changed assets matched source. ZIP integrity and download links, sizes and SHA-256 were verified, including the Windows ZIP browser download.
