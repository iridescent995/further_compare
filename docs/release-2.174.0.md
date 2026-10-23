# Version 2.174.0

Text and folder comparisons add **Automatic · filename** to Text format. Java, XML-family and SQL extensions resolve to the corresponding comment profile when the pair agrees. Unknown or conflicting filenames use plain text; manual profile choices remain available. The default remains Plain text.

Resolution is recalculated after file replacement, Save As and native rename notifications. Desktop paths take precedence over display names. Original text, editing history and file-operation bytes are preserved. Automatic settings persist in tabs, sessions and defaults; text children inherit active folder settings.

Folder caches and operation snapshots include resolved profiles, endpoint names, a mapping version and a plain-text fallback. Mixed or manually paired extensions remain conservative. Reports and CLI/batch output identify both requested and effective profiles per pair.

Custom filename mappings, grammar importance and full syntax-aware comparison remain pending. See [profile behavior and CLI usage](grammar-text-profiles.md).

Verification passed: 1,772 unit tests (one skipped), browser workflows and extended native workflows in both Apple Silicon and Intel Mac packages, including Save As, rename, saved paths and retained undo. All three platform ZIPs passed source and archive-integrity checks; download links, sizes and SHA-256 values passed. Windows runtime testing remains deferred at the user's request.
