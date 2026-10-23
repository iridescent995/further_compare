# Further Compare 2.78.1

Refresh selected now rechecks registered file paths when a file is replaced, deleted, changes type or gains a counterpart. Deleted pairs disappear; one-sided entries and newly matched pairs receive fresh metadata and colors. Only selected endpoints are read, with no sibling directory scan. A file that becomes a directory is shown without scanning inside it.

The native refresh operation is separate from strict selected-file comparison. Root, ancestor, path, symlink, revision and concurrent-request checks remain active. The renderer applies removed row IDs and preserves surviving selection and focus.

Validation is recorded in implementation-plan.json. Windows runtime acceptance and full product parity remain incomplete.

The unit suite passed all 554 tests. Source desktop regressions passed selected refresh, strict selected-file comparison and node refresh, including exact IPC scope, preserved selection/focus and untouched siblings.

Both final Mac packages passed selected refresh with deletion, replacement, new counterpart and type-conflict cases. All three package versions and changed assets matched source; archive integrity, download links, sizes and SHA-256 passed, including the Windows ZIP browser download.
