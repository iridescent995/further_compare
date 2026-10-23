# Release 2.144.0 — Table context actions

Table Compare now provides grouped right-click actions for opening files, CSV/XLSX export, paging, result initialization, undo/redo, row and column operations, settings, and supplied archive-entry actions. Right-clicking result cell chrome targets its row and column with pastel selection feedback. Keyboard menus restore focus; editable inputs retain native text menus.

Menu callbacks validate current inputs, result, selection, import generation and control values. Pending imports disable edits and exports while preserving the existing result and history. Missing inputs, unavailable pages and unavailable history actions are disabled.

Validation: six table-history unit tests, table runtime browser, workbook theme/import browser, and table context browser pass. Native table context tests pass in source and both final packaged Mac architectures, including exact CSV bytes and XLSX cell values, structural edits and undo/redo, keyboard focus and unchanged source files. Light/dark context screenshots inspected. All three ZIPs pass integrity checks; packaged versions/assets match; download links, sizes, SHA-256 and Windows ZIP browser download pass. Shipped branding scan has no matches.

Actual Windows runtime verification and remaining full-product capabilities are outstanding. The next source audit identifies three-way merge result-history and context-workflow gaps; those are not fixed by this release.
