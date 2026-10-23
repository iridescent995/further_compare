# Further Compare 2.65.0

Selection now offers files only on the focused side or both sides, newer files on their respective sides, and one-sided entries on both sides. Commands are available in the toolbar selector, right-click Selection submenu and native Actions menu.

Selections use visible loaded entries. File-only commands exclude directories and missing placeholders; newer selection uses paired-file modified times and excludes ties; one-sided selection includes existing one-sided files and directories. No command scans unopened descendants or modifies files. Both-side commands preserve focus on a selected entry when possible, moving to the other pane when only that pane has matches. Selection anchors are updated for subsequent range selection.

Unit and native tests cover file-only rules, both-side time comparisons, one-sided entries, focused targets, masks, empty results and unchanged files. Existing context-menu and row-selection regressions pass. The new native regression is included in desktop CI.

Both packaged Mac architectures passed the new selection regression. All three package versions and changed bundles match source; ZIP integrity and download verification passed. Windows runtime remains unverified.
