# Further Compare 2.15

## File manager comparison workflow

In the packaged app choose **File → File Manager Integration… → Enable integration**. Right-click a file outside the app, choose **Set as Left**, then right-click another and choose **Compare with Left**. The app remembers the left path across restarts and opens comparisons in new tabs, preserving existing unsaved tabs. Use the in-app Clear control to forget the path, or Set current left to use an opened text file.

macOS adds two Finder Quick Actions/Services. Windows adds a per-user Further Compare submenu in Explorer’s classic context menu; Windows 11 users look under Show more options. Labels are static. Dynamic filename labels, the modern Windows 11 menu, and folder selection are not included. The setup dialog removes the integration or repairs owned registrations after the app moves. Enabling is opt-in and does not change file associations.

The shared launcher handles a closed or running app, queues requests until initialization and current operations finish, rejects invalid/missing files, selects comparison types, and falls back to binary comparison for unknown non-text files. Requests always read disk files; unsaved text is preserved in its original tab rather than used as the selected file’s content.

See [setup and command-line installers](shell-integration.md) for details. Full-product work remains open in `implementation-plan.json`.

## Validation

All 132 unit tests pass. The desktop routing suite exercises actual second processes, original-argument forwarding despite Chromium reordering, startup, restart persistence, Unicode paths, missing paths, clearing selection, dirty-tab preservation and binary fallback. Chrome startup and alignment regressions pass. Both generated Finder workflows were executed through Automator using a temporary app, including filenames with shell metacharacters.

All three packaged applications match the source and release version, and all ZIP integrity checks pass. Windows was built and inspected but not executed on a Windows host. Finder menu discovery in the user's Services folder and Explorer menu rendering remain target-system checks; tests do not install into the user's actual Services folder or registry. Packages are unsigned previews.

Both final Mac packages passed the desktop shell suite: Apple Silicon natively and Intel via Rosetta. Each installed and removed both workflows through the native File menu using an isolated temporary home. The setup dialog was visually inspected. Download links, sizes, SHA-256 hashes and a browser download of the Windows ZIP passed.
