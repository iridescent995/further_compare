# Further Compare 2.62.1

Background node comparison now applies fresh size, modified-time and comparison results together when a file changed after directory listing. Previously the metadata mismatch caused the result to be discarded, leaving old size/date/colors until another scan. Updated parent metadata is also adopted when applicable. Changes still rely on the native reader’s validated result.

Each request captures its input row metadata. If another scan has already updated a row, an older comparison response cannot replace it. Collapsed nodes no longer receive late comparison updates. Status-only updates retain DOM rows; metadata changes rerender the table for correct sorting while preserving selection/focus.

The native regression failed before the fix with the old 4-byte changed row after both files became identical 14-byte files. It now verifies size/date/color updates without a follow-up scan, and holds an older completed comparison while a newer scan runs to verify no metadata rollback. Existing live-color DOM/focus/scroll tests and comparison-queue tests passed. The new regression is in desktop CI.

Both packaged Mac architectures passed the metadata-race regression. All three package versions and app bundles match source; ZIP integrity checks passed. Windows is cross-built but runtime-unverified.
