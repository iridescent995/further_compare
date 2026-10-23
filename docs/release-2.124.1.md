# Release 2.124.1 — Folder disclosure focus

A native Intel regression found that a folder redraw could lose keyboard focus when the expand/collapse button was focused. The existing redraw guard recognized the row itself and empty pane, but not a control inside a row. The focus repair treats focused row descendants as part of the folder tree and restores the row after rebuilding it.

Double-click disclosure regression coverage includes immediate/delayed clicks, replacement DOM, exactly one toggle/scan, retained selection/focus and no new comparison tabs. The broader folder audit covers compact columns, modifier/range selection, inline single-child chains, menus and asynchronous status colors.

A deterministic source regression failed before the fix and passed afterward: focus the disclosure, refresh, then verify focus returns to the rebuilt row. Natural and controlled second-click tests retain exact toggle, scan, selection and tab assertions. Source refresh-focus, filter-focus and selection regressions pass. Both packaged Mac architectures pass the new disclosure regression. All three ZIPs pass integrity checks; versions and final renderer/CSS assets match source. Download sizes, SHA-256 and Windows browser download pass. Shipped branding search is clear. Windows runtime and the broader feature gaps remain open.
