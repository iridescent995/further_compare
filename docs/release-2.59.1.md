# Further Compare 2.59.1

Renaming now requires the focused entry to be part of the single-row selection. Previously, selecting a.txt and moving focus to b.txt with Ctrl/Command+ArrowDown allowed F2 or native Rename to rename b.txt even though a.txt remained selected. Both routes now ask for one selected file or folder instead of opening a rename dialog for the wrong entry.

The regression reproduced the incorrect b.txt dialog before the fix. Afterward it verifies keyboard and native commands reject the unselected target without filesystem changes, and that selecting b.txt enables its normal rename dialog. Existing expanded-directory rename, open child path updates, unsaved edits, saved descriptors and collision rejection checks passed. Grouped context-menu coverage also passed.

Both packaged Mac architectures passed the extended selection regression. All three package versions and app bundles match the source, and ZIP integrity checks passed. Windows is cross-built but runtime-unverified.
