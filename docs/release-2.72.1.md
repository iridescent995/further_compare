# Further Compare 2.72.1

Folder right-click → Session & tools → New comparison now offers every one of the 13 supported session types. It uses the normal session creation command, opens a new tab, and preserves the existing folder comparison and its unsaved state. The extra level does not add top-level menu items.

Choosing a sort field from right-click now consistently selects ascending order, matching the native menu and sort selector. Reverse sort explicitly reverses the order; clicking a column header still toggles direction.

Source tests exercised all 13 new session routes through the real nested menu and verified parent roots, selection, unsaved state and original file contents. The folder-view test also covers repeated same-field sorting, explicit reversal and native-menu reset, alongside paired row ordering, flat views, parent return, save/reopen and file creation.

Full product parity and native Windows runtime verification remain incomplete. Both final Mac packages passed the new-session and sorting workflows. All three package versions and UI bundles match source; ZIP integrity, local download links, sizes and SHA-256 passed.
