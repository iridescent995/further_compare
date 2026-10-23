# Further Compare 2.73.0

Folder color legends can be shown or hidden from right-click → View and the native View menu. The setting is per comparison and saved with the session. New and older sessions show the legend by default. Hiding it makes the folder toolbar more compact without changing row colors or comparison rules.

The display toggle changes only legend visibility and session dirty state. It preserves row DOM identity, focus and selection and performs no directory listing or content comparison. It does not alter file-operation scope.

All 29 session tests passed, including strict boolean validation and round trips. The native desktop regression passed both menu routes, defaults, independent tabs, saved reopening, row preservation, zero folder I/O, unchanged comparison results and file-action scope. Both final Mac packages passed the same workflow. All three package versions and changed modules/UI/styles match source; ZIP integrity, local download links, sizes and SHA-256 passed.

Full product parity and Windows runtime verification remain incomplete.
