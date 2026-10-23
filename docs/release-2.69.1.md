# Further Compare 2.69.1

Compare selected files is available from folder right-click and the native Actions menu. It updates selected files in place using the current comparison rules, without opening tabs or comparing sibling files. One-sided files remain represented. Selection, focus and closed folders are preserved.

The native tree re-reads selected file metadata, preserves authorized endpoint identities, and rejects replaced entries, changed roots/alignment and stale concurrent results. Only selected paired files reach content comparison. Directory selections are refused by this command; Compare this folder remains available for a node's immediate contents.

Source validation: 541 unit tests pass, including seven selected-comparison tests. The real desktop selected-file regression verifies both menu routes, current metadata/colors, one-sided selection, untouched siblings and closed nodes, retained selection/focus and no new tabs. The existing node-comparison desktop regression passes.

Both final Mac packages passed the selected-file desktop regression. All three package versions, changed modules, renderers, ZIP integrity and download sizes/hashes were verified. Windows runtime verification and full product parity remain incomplete.
