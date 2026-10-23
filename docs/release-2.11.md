# Further Compare 2.11

## All files view

Folder View now offers **All files**, alongside Tree and Loaded files. It traverses the selected roots and compares each node's immediate files, then shows relative paths in one paired list. It does not require expanding the tree, and returning to Tree preserves the previous expansion state. Sorting, masks, filters, single-click selection, modifier selection, double-click comparison and file actions apply to the recursive results.

Results and progress appear incrementally. Stop preserves the partial result; Refresh starts a new traversal. Saved sessions retain the view mode and rescan when reopened. Background polling does not repeatedly traverse the entire tree: use Refresh to pick up later filesystem changes. Folder Refresh no longer asks to discard session settings because it does not discard them.

Traversal follows the existing folder rules: symbolic links, special files, `.git`, `node_modules`, and `.DS_Store` are skipped and the skipped count is displayed. At most 5,000 directory nodes and 50,000 entries are published. Limits, cancellation and errors are labelled as partial results. Cancellation takes effect between node reads; an in-flight node comparison may finish before its result is discarded.

File-versus-directory conflicts retain the conflicting row while allowing the directory side's descendants to be browsed and compared. A missing directory or file ancestor on the other side is treated as absent rather than aborting the traversal.

The desktop View menu and folder right-click menu also expose the recursive view. Full-product work remains open in `implementation-plan.json`; this release does not complete remote sources, three-way folder merge, advanced rules or archive editing.

Open and folder-view controls now reflect an active operation immediately, preventing quick consecutive clicks from silently dropping a requested view change.

## Validation

All 105 unit tests passed. Recursive integration tests passed in both final Mac packages (Apple Silicon natively, Intel through Rosetta), covering nested hashes/colors, type conflicts, filtering/sorting, selection, child comparison, preserved expansion, fresh refresh, cancellation/resume and saved-session reopening. Existing folder view, expansion, navigation, text-format and browser regressions also passed.

The recursive layout was visually inspected. All three packages match the final source and version. ZIP integrity, download links, sizes and SHA-256 checks passed. Packages are unsigned previews; Windows was built and inspected but not executed on Windows.
