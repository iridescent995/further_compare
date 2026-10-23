# Further Compare 2.56.0

Archive Compare now offers Save left file as… and Save right file as… in the toolbar and row context menu. A selected file is read with the existing archive integrity checks and saved through the native destination dialog, with its basename suggested. Output is byte-exact and limited to 32 MB per entry. Folder and missing-side actions are disabled. Collapsing a selected descendant clears that hidden selection. This saves individual files; directory extraction, archive editing and repacking remain unfinished.

An export captures the selected entry and archive generation. A session reset or archive replacement before reading finishes discards the stale result; corrupt entry data cannot reach the save dialog. Context menus now measure their actual bounds to stay onscreen. Long archive timestamps remain within their columns and expose full text on hover.

Validation: source and both packaged Mac builds passed byte-exact binary left/right saves, cancellation, basename suggestion, disabled actions, collapse selection, menu edge placement and unchanged source archives. ZIP and TAR.GZ against ZIP comparison/session/child-return workflows passed with native entry saving. Browser async checks cover delayed export cancellation and corrupt-entry rejection. The TAR timestamp layout was visually inspected after correction. The new native save suite is included in CI.

All three package versions and archive UI assets matched the build; ZIP integrity checks passed. Windows runtime verification remains pending, as does broader full-product parity.
