# Release 2.114.2 — keep folder focus after display preferences

Closing Display preferences now returns keyboard focus to the same folder entry even when a background disk refresh replaces its row while the dialog is open. If the file disappears, focus returns to its pane. Captured focus is scoped to the original tab and folder roots; ordinary text and toolbar controls retain their existing restoration behavior.

A deterministic regression reproduces the failure in the previous Apple Silicon package and passes with the fix. It covers both panes, Done and Escape after actual disk changes/background refresh, focus remaining inside the modal, removed-entry fallback, session isolation and text control focus. Browser appearance checks pass for themes, pastel contrast, density, paired panes, persistence and reset. The context-menu inventory now includes newer workspace, encoding, selection and action-history commands.

Both Mac packages pass the deterministic focus regression; the Apple Silicon package also passes the expanded context-menu integration suite. All three platform ZIPs passed integrity checks, packaged renderer/version checks and download size/SHA-256 verification. Windows runtime and the broader product gaps remain open.
