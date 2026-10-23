# Further Compare 2.59.2

Compare this folder now works on collapsed folders in Tree view, from the context menu or native command. It compares the immediate files and opens those results inline. Nested folders remain closed, unrelated branches are not scanned, and no comparison tab is created. Existing expanded-folder comparison still refreshes added/deleted entries and parent metadata.

The native regression verifies a previously unopened folder produces exactly one tree-compare request for that folder, with no nested or unrelated reads. It also retains the expanded-folder refresh, descendant eviction, parent properties, native route, focus and selection assertions. Startup root comparison is explicitly awaited before measuring command requests. The comparison-queue regression passed, including expansion during comparison, collapse, rule changes and tab switches.

Both packaged Mac architectures passed the extended node comparison regression. All three package versions and app bundles match the source, and ZIP integrity checks passed. Windows is cross-built but runtime-unverified.
