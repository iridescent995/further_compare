# Version 2.175.0

Text and folder comparisons now support custom filename formats. Open **Filename formats…** in comparison options to add, reorder or remove basename patterns and preview their effects. The first match overrides built-in extensions; Plain text keeps comments significant. Unknown or conflicting pair formats remain conservative.

Mappings persist independently in tabs, sessions and defaults, flow into folder child comparisons, and follow Save As and rename without discarding edits or undo. Exact ordered rules bind comparison caches and operation snapshots. Local and SFTP comparisons use the same resolution. Reports and CLI/batch output retain the mapping configuration and effective format.

Patterns support `*` and `?`, with bounded matching and literal regex characters. See [format rules and scripting usage](grammar-text-profiles.md).

Verification passed: 1,790 unit tests (one skipped), browser workflows, light/dark/narrow visual checks and extended native workflows in both Apple Silicon and Intel Mac packages. All three platform ZIPs passed bundled-source and archive-integrity checks; download links, sizes, SHA-256 values and the Windows ZIP browser download passed. Windows runtime testing remains deferred at the user's request.

Custom grammar importance, syntax-aware alignment and richer document comparison remain pending.
