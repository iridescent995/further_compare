# Further Compare 2.82.0

Folder right-click Compare and native Actions now offer Ignore selected differences, Restore selected differences and Restore all ignored differences. Ignored entries remain visible under All with muted, struck-through filenames. Their differences are omitted from navigation and displayed difference counts, and they are never reclassified as matching files.

Marks are temporary and separate per open tab. They are not written into saved sessions. Selecting an ignored folder also suppresses differences in descendants loaded later, using both actual endpoints for aligned rows. Restoring a descendant restores its containing ignored scope. Loaded metadata changes conservatively invalidate marks; changing roots, swapping sides, changing rules or clearing/changing alignment clears them. Collapsing a branch retains its marks.

This is a display/review action. Explicit file-operation previews still use the original comparison results and existing operation filters. Reports count ignored entries separately and retain actual status and comparison provenance in HTML, CSV, text and JSON. No equality is inferred and no files are changed by marking entries.

Twenty-seven focused unit tests passed, including 20,000 rows with 1,000 marks, aligned ancestry, metadata invalidation and all report formats. Source desktop checks passed for both menu routes, difference filters/navigation, tab isolation, explicit copy preview, temporary persistence, report results, later-loaded descendants and restore. Existing context-menu, folder-report and live-color regressions passed. Final package evidence is recorded in implementation-plan.json.

Final Apple Silicon and Intel package workflows passed. All three package versions and changed assets matched source; ZIP integrity and download links, sizes and SHA-256 checks passed. Windows runtime and full product parity remain outstanding.
