# Exact folder paths and automatic name matching

The default tree compares exact paths. Case-insensitive or normalization-insensitive filesystem lookups must not silently manufacture a counterpart with the source spelling. Tree entry authority checks the canonical full path before reading metadata and again during revalidation. Selected roots are already canonicalized by FolderService.select; requested child components originate from directory enumeration or explicit alignment. Actual user-created manual alignments preserve both endpoint names.

The 2.127.1 fix keeps differently spelled entries separate by default. It does not introduce automatic case-insensitive or Unicode-normalized tree pairing. This distinction also protects operation snapshot keys, backup paths, and endpoint reservations. Native Windows verification remains required: roots are canonicalized using the same realpath API before joining child components, but that is not a substitute for execution on Windows volumes.

## Automatic matching architecture (implemented in 2.128.0)

The opt-in tree policy uses actual enumerated child paths, reserve explicit manual alignments first, pair exact names next, then pair only unique case/NFC groups. Ambiguous groups remain separate. Files and directories are matched; cross-kind pairs remain explicit conflicts. Computed mappings are inventory-derived and must not be saved as manual user choices.

The same policy constructs operation mappings from captured namespaces, including unopened descendants of selected folders. Display-only pairing or accumulating mappings only as nodes expand makes destructive-operation results depend on expansion history. Outstanding plans are invalidated by policy changes and relevant namespace changes.

Native integration points are FolderTree load/refresh/alignment replacement; FolderProjection type validation; MappedPlanner snapshot projection; UpdateBothOperations inventory; and filtered delete, move, and copy-to-destination counterpart capture. Selected operations need to discover real counterpart paths before taking target snapshots, while retaining existing node-scoped browsing. Sessions store policy options separately from manual mappings.

The existing flattened FilenameMatching mode is not a direct substitute: it matches files across directory structures and currently resolves duplicate groups positionally. A node-scoped policy must retain directory structure and leave ambiguous groups unpaired.

Required tests include exact-first pairing, ambiguous groups, case and NFC/NFD names, manual reservations, cross-kind conflicts, closed descendants, both transfer directions, backup spellings, filtered eligibility, and aliases appearing after preview. Tests on case-sensitive filesystems must cover namespaces that case-insensitive filesystems cannot create.

2.128.0 adds PathNameMatching, staged lazy tree inventory, policy persistence, and a bounded operation metadata-discovery layer. Defaults retain exact names. Operation projection keeps existing portable alias-conflict safeguards. Native Windows validation remains outstanding.

## Final-extension pairing (2.129.0)

The optional `ignoreExtension` policy runs after exact and case/Unicode full-name matching. It pairs only unique unmatched regular-file stems within corresponding directories. The final dot is removed only when it follows at least one character; `.env` remains a whole stem and `archive.tar.gz` has stem `archive.tar`. Directories never pair by extension. Manual endpoints remain reserved. The same policy applies to unopened-descendant operation inventories and stale-preview validation, without changing actual names or saving computed pairs as manual alignments.

## Filename spelling as a comparison criterion (2.130.0)

`folderRules.compareFilename` is separate from pairing policy. After endpoints are paired, their actual basenames are compared exactly, including case, Unicode spelling and extension. A difference contributes `filename` to `metadataDifferences` while retaining `contentStatus`; matching file bytes remain distinguishable from matching names. Parent-path spelling alone does not make a child name different. Directory name differences do not imply verification of directory contents.

Live comparisons and captured operation inventory classification supply explicit actual endpoint paths. Enabled spelling comparison rejects missing paths rather than inferring a name from incomplete snapshots. The criterion is available on Windows independently of Unix permission/owner/group checks. It never renames files or changes pairing authority.
