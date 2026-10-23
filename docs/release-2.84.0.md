# Further Compare 2.84.0

Folder context Navigate > Go to both parent folders and native View > Folder Navigation > Parent Folders (Both Sides) move the chosen roots up together in the current tab. Each side retains its independent Back history. Absent sides remain absent, and a filesystem-root side stays in place.

Both destinations are validated as one final pair before committing. Missing or inaccessible destinations, overlapping roots and backup-directory overlap leave roots, histories and pending plans unchanged. Successful navigation clears stale comparisons, alignments, ignored marks and selections, then compares the new immediate root node.

Seven navigation unit tests passed. The desktop regression verified both menu routes, a single retained tab, fresh inline rows, independent Back histories, and rejection of a shared parent with both roots unchanged. Package validation is recorded in implementation-plan.json. Windows runtime and full product parity remain outstanding.

Final Apple Silicon and Intel package workflows passed. All three package versions and changed assets matched source; ZIP integrity and download links, sizes and SHA-256 verification passed.
