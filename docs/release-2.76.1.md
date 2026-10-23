# Further Compare 2.76.1

Folder context Properties and native Actions now offer Copy Filenames and Copy Relative Paths alongside existing Copy Paths. Each action copies one line per selected entry from the focused side. Relative paths are relative to that side's chosen root. Manually aligned entries retain their actual side-specific names and locations.

The native clipboard handler accepts only absolute, relative and name formats. It resolves opaque row IDs, checks current revision and file authority, and revalidates every selection before writing. Invalid formats, forged IDs and stale revisions leave the clipboard unchanged. Existing callers default to absolute paths.

Source runtime tests passed aligned cross-directory names, per-side relative paths, stale/forged selection rejection, existing full-path behavior, multi-selection, actual context/native routes and keyboard typeahead across the expanded Properties submenu. Final package evidence is recorded in implementation-plan.json. Full product parity and native Windows verification remain incomplete.
