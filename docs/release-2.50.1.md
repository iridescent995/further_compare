# Further Compare 2.50.1

Folder Compare now offers **Matching files (current rules)** in the selection dropdown, **Selection → Select matching files** in the context menu, and **Actions → Select by → Matching Files (Current Rules)** in the native menu. It selects visible paired files whose completed result matches under the chosen comparison method. Directories, pending entries and filtered files are excluded; unopened folders are not scanned.

Both panes are now reachable with Tab, including an empty pane or one containing only missing-side placeholders. Shift+F10 opens the focused pane's context menu. Focus alone does not select or open files. Sorting buttons retain their normal keyboard positions between panes.

Validation completed:

- All 456 unit checks passed.
- Native typeahead, page navigation, grouped context menus and modifier/range selection passed.
- Both packaged Mac architectures passed matching-selection and pane-focus workflows.
- All three ZIP archives passed integrity and source verification; Windows native resources matched.
- Download links, sizes, SHA-256 and a Windows ZIP browser download passed.

Windows runtime testing and broader full-product work remain pending. Reference-app inspection is waiting for the Mac to be unlocked.
