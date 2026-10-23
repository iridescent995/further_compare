# Release 2.111.0 — archive-entry menu access

Linked text, binary and table tabs expose an Archive entry submenu on right-click or Shift+F10. Apply actions open the existing review, including table format disclosures. Return to parent archive navigates without applying or saving. Inactive-tab actions retain their original target and recheck it after waiting for other operations. Missing sides, closed parents and unavailable table results are disabled.

The native File menu also provides Archive Entry apply and return commands. Tab context menus now share folder menu positioning and theme styling and dismiss on outside clicks or resizing.

Fixed archive entry Save file as, which referenced an undefined variable before reaching the save dialog. The new native archive commands are included in the desktop event allowlist.

Validation: 896 unit tests passed, one Windows-native test skipped. Source and both Mac packages passed actual native callbacks, active/inactive tab targeting, keyboard focus, cancellation, byte-exact text/binary apply, table-result availability, parent return without saving, missing/closed parents and standalone session isolation. Archive Save As exact-byte/cancel/menu tests passed in source and both packages. Existing folder context and browser tab-close regressions passed. Light/dark menus were inspected. All three package versions/UI/styles/native files, ZIP integrity, download links/sizes/SHA-256/browser download and branding checks passed. Full-product scope and Windows runtime validation remain open.
