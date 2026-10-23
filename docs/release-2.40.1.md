# Further Compare 2.40.1

Full-path folder exclusions now hide descendants using their actual disk ancestors. Previously, a manually aligned file could remain visible when its disk parent was excluded but its displayed logical parent was elsewhere. For example, excluding `build/cache` now hides a right-side `build/cache/output.txt` aligned beneath a left-side `source` folder. Clearing the filter restores the row. Similar names such as `build/cache-other` remain visible.

The regression failed before the fix and passed afterward. All 429 unit tests passed. Both packaged Mac architectures passed the native folder-tree UI suite, including alignment, full-path exclusion/restoration, colors, single-click selection, double-click opening, parent return and clearing alignment. All three archives passed ZIP integrity and version/source checks. Download links, sizes, SHA-256 and an actual Windows ZIP browser download passed. Windows runtime verification remains pending.
