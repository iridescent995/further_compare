# Further Compare 2.33.0

Folder comparison can align independently selected files or folders in the existing tree, including entries with different names or parents. Select one entry on each side with Command/Ctrl, then choose **Align selected pair**. **Clear alignment** restores ordinary matching. Each pane displays its actual filename; reports include both paths.

Native row references keep operations tied to the actual selected entries. Copy, move, merge, sync, delete, rename, timestamps, external editing, reveal and file opening resolve each side independently. Saved folder sessions preserve validated alignment descriptors. Stale previews and replaced roots are rejected. Creating a file beside an aligned file uses that side's actual parent. Canceling a native operation confirmation leaves the preview available for retry.

The light palette now combines warm ivory, coral, mint, amber and orchid. Dark mode uses plum surfaces with brighter jewel accents. Both retain distinct colors for differences, one-sided entries and selection. Appearance settings are shared by the browser and desktop UI.

Validation in development: 328 unit tests passed. Native bridge, operation and renderer tests cover cross-parent alignment, actual paths, stale revisions, save/restore, rename, swap, backup-preserving operations, selection and double-click opening. Existing folder expansion, live colors, context menus, reports, recursive view, rules, navigation, Open As and move checks passed. Browser appearance checks passed for light/dark/system, persistence, compact and comfortable rows, and narrow layouts.

Both final Mac packages passed alignment bridge, action, renderer and move workflows (Intel under Rosetta). All three archives passed integrity checks, bundled versions and files matched source, and download links, sizes, SHA-256 checksums and the Windows ZIP browser download passed. Windows runtime verification requires a Windows host. Full-product remaining scope is tracked in `implementation-plan.json`.
