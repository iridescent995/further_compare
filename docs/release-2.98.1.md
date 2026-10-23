# Release 2.98.1 — right-click window creation

Folder rows now expose New Window under Session & tools, matching the Session menu. Opening it preserves the parent window's tabs and selected row and starts an empty desktop window.

Source integration checks passed the right-click command, compact grouped menus, keyboard navigation, focus restoration, single/double-click selection, modifier/range selection and content-based color updates. Direct reference-app inspection was attempted but macOS was locked. Windows runtime and remaining full-product parity remain unverified.

Final checks: both Mac packages passed the grouped-menu workflow including New Window and parent preservation. Node comparison passed selected-node-only updates and unrelated-branch preservation. All three bundles matched current source/version; ZIP integrity, links, sizes, SHA-256 and Windows ZIP browser download passed.
