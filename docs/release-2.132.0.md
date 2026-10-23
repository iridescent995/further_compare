# Release 2.132.0 — Folder settings menu access

Added View > Filters & options… to folder right-click menus and View > Folder Filters & Options… to the native application menu. Both open the full existing settings dialog, preserve selection, and return focus to the tree on Escape.

The menu audit exposed a regression from the consolidated toolbar: existing settings shortcuts tried to click a toolbar button while command dispatch had temporarily disabled it. They now call the dialog's open API directly. Filename, timestamp, automatic refresh and metadata shortcuts defer their requested focus until command dispatch finishes. On Windows, metadata options focus filename comparison rather than a disabled Unix control. The new native command is included in the preload allowlist.

Source native checks pass the full grouped menu inventory, keyboard traversal, disabled skips, hover switching, multi-selection preservation, light/dark viewport-edge placement, and both overview routes. Existing filename, timestamp-exception, automatic-refresh and Unix metadata workflows pass. Both final Mac packages passed the full menu audit, including the actual native overview callback. All three ZIPs passed integrity checks; packaged versions, native menu/preload and final renderer assets match source. Download links, sizes, SHA-256 and browser Windows download passed; shipped branding checks are clear.

Actual Windows runtime and remaining full-product scope remain open.
