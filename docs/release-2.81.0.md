# Further Compare 2.81.0

Folder right-click View and native Actions now offer Exclude file types. The dialog previews extension masks derived from the selected pane's actual filenames, then appends them to existing filters. Multiple types and case variants are deduplicated. Cancel changes nothing; a changed folder context or changed filter expression invalidates the pending application.

These are standard filename masks: matching files at any depth, and matching folder names plus their descendants, are hidden from both panes. The dialog explicitly describes that scope. Existing session persistence, temporary filter suppression, reports and filtered file operations continue using the same filter expression. No files are modified and no folders are scanned by the exclusion command itself.

Folders, conflicts, dotfiles, missing extensions and extensions that cannot safely be expressed as masks are rejected. Exclude selected remains available for exact paths.

Nineteen focused unit tests passed. Source desktop checks cover context/native access, preview/cancel, stale-dialog rejection, both panes, mixed and case-varied extensions, later-expanded folders, persisted masks and unchanged files. Exact-path exclusion and the original folder selection/column requirements also passed. Final package evidence is recorded in implementation-plan.json.

Final Apple Silicon and Intel exclusion workflows passed. All three package versions and changed assets matched source; ZIP integrity and download links, sizes and SHA-256 passed. The current source node-only comparison and live-color regressions also passed. Windows runtime and full product parity remain unverified.
