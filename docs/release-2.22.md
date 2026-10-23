# Further Compare 2.22.0

Select one entry on the left, then Ctrl/Command-click an entry on the right and choose **Compare pair**, **Compare selected pair** from the context menu, or **Actions → Compare Selected Pair**. The selected entries may have different names or relative paths.

Two files open in a child comparison using their actual paths. Compatible recognized types use their corresponding comparison engine; unknown text uses text comparison, while binary inputs or conflicting recognized types use binary comparison. Text pairs retain save and reload access to their original files.

Two folders open as the roots of a new folder comparison, inheriting the parent's comparison rule. The parent tab, roots and selections remain available through Back to folder. This opens an independent comparison; it does not realign or rename rows in the parent tree.

Mixed file/folder selections, missing entries, traversal and symlink paths are rejected. Both sides are staged and revalidated before changing the active native session. The selection indicator now reports left and right counts separately when both sides are selected.

All 169 unit tests pass. The new desktop test covers toolbar/context/native entry points, invalid selections, literal filenames, text save/reload, text/table/binary routing, isolated folder roots, inherited rules and parent selection restoration. Existing selection and grouped-menu regressions also pass.

Both final Mac packages pass the selected-pair integration. All three package versions and bundled pair workflow, renderer and styles match source. ZIP integrity and browser download link, size and SHA-256 checks pass.

The broader full-product scope and native Windows runtime verification remain in progress.
