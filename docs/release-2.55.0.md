# Further Compare 2.55.0

Properties now offers Calculate folder size for each selected directory. The explicit action recursively sums file lengths from metadata without reading/hashing contents or opening nodes in the comparison tree. The normal Properties lookup stays nonrecursive. Calculated directory totals do not change the Selected file total summary.

Scans use native row IDs and selected-root authority, reject changed paths, and skip links and special files. Up to 50,000 entries are visited with a 10-second budget checked between entries; an individual filesystem call can take longer. Skipped entries or a reached limit produce a clearly marked Partial total. Counts describe file bytes by path, not allocated disk space; hard links are counted by path. Closing Properties does not cancel an already running bounded scan, and late results cannot update a newly opened dialog.

Validation: 472 unit tests passed. Folder-size cases cover metadata-only traversal, exact totals, limits, cycles/links, invalid paths and changed authority. Properties desktop tests passed in source and both packaged Mac architectures, including actual displayed totals, unchanged tree expansion, native stale/forged ID rejection, selection metadata, aligned paths and both themes. The rendered size result was inspected.

All three packages contain matching UI and native source, and ZIP integrity checks passed. Windows runtime verification remains pending; broader product parity remains incomplete.
