# Further Compare 2.63.0

Folder comparison now offers Exclude selected in the right-click View submenu and native Actions menu. It adds the selected side’s actual root-relative paths to the session filters, hides paired rows and selected-folder descendants, and prunes hidden selections. Reset masks restores the entries. No file contents are changed.

Double-quoted JSON path tokens preserve literal semicolons, wildcard characters, quotes, backslashes and whitespace. Bare filename masks keep wildcard semantics. Exact root paths do not hide identically named entries in unrelated subfolders. Aligned rows use their actual side paths. Duplicate additions are suppressed, and the generated expression is bounded to the existing 4096-character filter limit. Unfinished quoted paths are reported rather than silently swallowing newly selected exclusions.

Source validation covers right-click and native commands, both panes, multi-selection, selected subtrees, retained nested names, semicolon filenames, reset, unchanged disk files, saved-session restoration and grouped menu interactions. Unit checks cover special characters, aligned paths, bounds and malformed quotes; filter and report regression tests pass. The new desktop test is included in CI.

All 482 unit tests passed. Both final Mac packages passed the exclusion regression. All three package versions, app bundles and native menu/bridge sources match the current source; ZIP integrity checks passed. Windows is cross-built and runtime-unverified.
