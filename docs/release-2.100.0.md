# Release 2.100.0 — reviewed patch application in text editors

Apply Patch is available in the File/native menus and text options. Users can choose a UTF-8 unified patch or paste one, select a file entry from a multi-file patch, choose either editor, and reverse direction. Preview captures the target text and shows the complete result up to a bounded display limit. Apply rechecks the target session and text, updates only the chosen editor, and creates an undo entry. Saving remains a separate action; patch filenames never select filesystem destinations.

The parser validates hunk counts, ranges, ordering and newline markers before application. Unsupported binary/combined patches and records without change hunks are rejected. Context and removed lines must match exactly; matching context may relocate a hunk, but fuzzy mismatches and automatic line-ending conversion are disabled. Creation/deletion records enforce empty-input/output semantics. Input, output, record and hunk limits plus a cancellable worker watchdog bound processing. Malformed or nonmatching patches produce no partial result.

Source browser and desktop checks passed preview/cancel, immediate reopen, paste/UTF-8 file input, multi-record and target selection, forward/reverse apply, undo/redo, wrong-base rejection, stale-target rejection, retained wrap and unchanged source disk files. All 821 unit tests passed, including 18 patch-application cases. The preview was visually inspected.

This provides individual text-entry application. Whole-folder patch application, filename/permission metadata application, Windows runtime and remaining full-product capabilities are still open.

Final packages: both Mac architectures passed patch application, reverse, multi-entry/side selection, undo/redo, stale-target rejection, cancel, rapid reopen and disk preservation. Existing patch export and live-editor browser regressions passed. All three bundle versions/assets matched source and ZIP integrity passed. Download links, sizes, SHA-256 and Windows ZIP browser download passed. No reference branding was found in shipped source.
