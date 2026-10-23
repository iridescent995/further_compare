# Version 2.177.0

Table comparison supports selecting individual cells or rows and copying literal values from either source into the editable result. Cmd/Ctrl adds selections and Shift extends ranges. Toolbar and context-menu actions share keyed row mapping, undo/redo, saved-session bindings and stale-source checks.

Missing destination rows require explicit whole-row selection and are appended. Sparse cell edits can be saved into a copy of the original XLSX while retaining unrelated styles, formulas and sheets. Structural row/column edits still require values export. Formula and formatting copying remain pending.

See [selective table copying](table-selective-copy.md). Windows runtime testing is deferred at the user's request.

Verification passed: 1,833 unit tests (one skipped), browser selection/context regressions, native sessions and workbook export, and the same workflow in both Apple Silicon and Intel Mac packages. Light/dark screenshots were inspected. All three packages passed bundled-source, archive-integrity and download verification. Finder menu discovery remains pending installation of the generated services on this Mac.
