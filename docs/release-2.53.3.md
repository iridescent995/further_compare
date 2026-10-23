# Further Compare 2.53.3

Folder Merge and Folder Sync now expose Direction → Left → Right / Right → Left from the folder context menu. The menu shares the toolbar direction and disables the current choice. Review changes uses that direction. A direction change invalidates any previously opened context menu to prevent stale commands.

Validation: new desktop regression passed in source and both packaged Mac architectures. It checks both session types, disabled current direction, toolbar parity, preserved selection/focus, copy/delete/no-op previews, stale-menu rejection, absence in Folder Compare, and unchanged fixture files. Existing grouped context-menu regression also passed. The new test is included in the cross-platform CI workflow.

All three desktop archives passed ZIP integrity checks and contain the expected version and UI bundle. Windows runtime verification remains pending.
