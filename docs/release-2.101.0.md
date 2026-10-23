# Release 2.101.0 — reviewed folder patches

Folder comparisons can apply a multi-file unified patch through Actions or the right-click Session & tools menu. The borderless pastel dialog accepts UTF-8 patch files or pasted text, left/right targets, path stripping, reverse application and source-file encoding. Preview lists every affected path and planned operation before native confirmation.

Modified, created, deleted and renamed files are supported. Existing file encodings and BOMs are preserved. Replaced and deleted files are backed up before writing; unrelated files remain untouched. Stale sources, replaced roots/ancestors, unsafe paths, links and ambiguous names are rejected. Success refreshes the tree and remaps open renamed-file comparisons.

This applies file contents, not permission or other metadata patches. Multi-file execution is not crash-atomic; interrupted or failed execution can leave partial changes and reports the backup location. Filesystem check/use races cannot be eliminated entirely.

Validation: all 834 unit tests and source desktop patch workflows passed, including preview cancellation, file changes, backups, stale plans and open-tab remapping. Folder menu, selection, node refresh and automatic chain expansion regressions passed. The dialog screenshot was inspected. Both Apple Silicon and Intel Mac packages passed the full patch workflow. All three package versions and changed assets matched source; ZIP integrity and download links, sizes, SHA-256 and browser download passed. No reference branding was found in shipped source. Windows runtime remains unverified.
