# Further Compare 2.41.1

Folder selection criteria now move keyboard focus to the selected side. Previously, choosing **Select right only** from the left pane selected the right files but left keyboard focus on the left. Arrow keys could then act in the wrong pane.

The current row is retained when it belongs to the new selection; otherwise focus moves to the first selected row. Shift-range selection starts from that row. If a criterion finds no matches, focus stays on a real row on the requested side (or the empty pane), without selecting an entry.

The regression failed before the fix and passed afterward. Source tests passed right-click, toolbar and native-menu selection, Shift ranges, empty matches, normal modifier selection, single-click selection, double-click comparison and parent return. Both packaged Mac architectures passed the updated grouped context suite. All three archives passed ZIP integrity and version/source checks. Download links, sizes, SHA-256 and an actual Windows ZIP browser download passed. Windows runtime verification remains pending.
