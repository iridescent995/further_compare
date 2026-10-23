# Further Compare 2.19.0

Copy to Folder… copies selected entries from either comparison side to a folder chosen in the native file picker. It is available from the folder context menu and native Actions menu. The comparison roots stay unchanged.

The preview shows the source, destination, every planned operation, and replacement markers. Paths remain relative to the comparison root: selecting `src/config.json` produces `destination/src/config.json`. Selecting a directory includes its supported descendants. Cancellation at the picker, preview, or native confirmation leaves file contents unchanged.

The operation reuses the existing snapshot validation and overwrite backup workflow. Changed source or destination snapshots prevent execution; overlapping roots and unsupported symlinks are rejected. Existing scan limits and ignored-entry rules apply. Multi-file copies are not transactional; an execution error may leave completed operations in place and reports backup information.

All 153 local unit tests pass. The development Electron regression covers cancellation at each stage, multiselection, nested paths, overwrite recovery, the right-side native menu, unchanged roots, stale snapshots and overlap rejection. Windows runtime verification remains pending on a Windows host.

Both final Mac packages pass the same workflow regression. All three packages contain the expected version and matching native, renderer and theme sources. ZIP integrity and browser download link, size and SHA-256 verification pass.
