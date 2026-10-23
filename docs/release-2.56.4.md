# Further Compare 2.56.4

Typing a filename containing spaces now continues the folder-tree search instead of toggling the current selection. Space still toggles selection outside an active search (including after the one-second search timeout). Both panes use the same behavior.

Current-source validation: folder selection, comparison queue, live colors and expansion desktop regressions passed. The 16 native folder-tree unit tests passed, including checking unopened descendants are not hashed and independent node comparisons remain isolated. The filename-search regression covers multi-word names and standalone Space toggling on both sides.

The original folder requirements have direct test coverage for 23px rows, Name/Size/Last modified columns, no selection checkboxes, modifier multi-selection, single/double clicks, inline expansion, live colors and grouped right-click actions. Broader product parity and Windows runtime verification remain incomplete.

Both packaged Mac architectures passed the filename-search regression. All three desktop packages contain the matching version and application bundle. ZIP integrity checks passed for Mac ARM64, Mac x64 and Windows x64.
