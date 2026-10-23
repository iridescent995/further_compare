# Further Compare 2.5

This release adds productivity tools to the existing comparison workspaces.

- Text editing: literal find and replace, case matching, go to line, per-side bookmarks, wrapping, visible whitespace, and copying complete selected lines across. Text tools and bookmarks are saved with sessions.
- Folder comparison: semicolon-separated include/exclude patterns and selection by changed, one-sided, or newer files. Selection can be inverted on the focused side. Masks affect the displayed entries; they do not redefine a selected directory's copy/delete contents. Review the operation preview before applying changes.
- Folder snapshots: save relative metadata and SHA-256 hashes, then compare two saved snapshots without the original folders. Reports are read-only and exportable as JSON.
- Tables: XLSX worksheet selection, comparison of stored values, editable result cells, CSV export, and pagination across all supported rows. Formulas use cached results; the app does not recalculate formulas or compare workbook formatting. Legacy XLS/XLSB/ODS input and XLSX output are not supported yet.
- Command line: text, folder, binary, and delimited-table comparison with exit codes and JSON, text, or HTML reports. See [CLI usage](cli.md).

The launch chooser remains desktop-only. Shared desktop features are packaged for Apple Silicon Macs, Intel Macs, and Windows x64.

This release is a milestone toward the full product scope. Remote sources, archives, media and registry comparison, and additional editing and automation features remain tracked in `implementation-plan.json`.
