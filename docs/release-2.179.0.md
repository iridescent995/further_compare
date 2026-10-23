# Version 2.179.0

Added Shift-JIS, EUC-JP, GB18030, Big5 and EUC-KR input/output choices across text comparison, merge, folder text rules, folder patches and scripting. Malformed inputs and unrepresentable output fail without replacing data. Auto remains BOM/UTF-8 only.

Valid alternate byte mappings are preserved for unchanged saves. Editing these files requires explicit normalization consent or switching output encoding. Undo/redo and sessions preserve this choice; reports and reusable defaults exclude the original-byte metadata. Folder patch review discloses normalization and invalidates its token when the choice changes.

See [encoding behavior and mapping variants](legacy-text-encodings.md). Verification passed: 1,868 unit tests (one skipped), browser/native encoding workflows, folder-patch regression checks, and both Mac packaged encoding workflows. All three packages passed bundled-source, ZIP-integrity and download checks. Windows runtime testing remains deferred.

The closed installed app at `~/Applications/Further Compare.app` was updated to 2.179.0 using exclusive directory renames. Its bytes match the verified Mac build and all three Finder service targets remain valid. The prior 2.178 app is retained for recovery.
