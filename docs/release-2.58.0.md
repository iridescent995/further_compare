# Further Compare 2.58.0

Archive trees now support Ctrl/Command multi-selection, Shift ranges, additive modifier+Shift ranges, Ctrl/Command+A, and Space toggling. Right-clicking a selected row preserves the selection. The context menu includes Select all visible and Clear selection. A selection count is shown in the toolbar, and the tree advertises multi-selection to assistive technology.

Single-file save and context Open comparison actions are disabled for multiple selected rows; they do not silently choose one file. Single click selects, double click still opens a comparison, and hidden descendants are removed from selection when collapsed. Archive replacement/reset clears selection and its range anchor. This does not implement batch archive extraction.

The expanded native save regression verifies modifier/range selection, selected-row context behavior, select-all/clear, focus restoration, no accidental comparison opening and the existing byte-exact save cases. Existing ZIP session/double-click workflow and archive replacement/save race tests passed.

Both packaged Mac architectures passed the expanded archive selection/save regression. The archive layout was visually reviewed. All three package versions and application bundles match the source build; ZIP integrity checks passed. Windows runtime verification remains outstanding.
