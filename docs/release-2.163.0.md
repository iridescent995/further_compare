# Version 2.163.0

Standard Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z now route comparison edits through per-tab undo/redo. Windows/Linux also accept Ctrl+Y. Other text fields and open dialogs retain native editor history.

Clicking one text line or its gutter selects just that line for cross-pane copying. Highlighted ranges and Command/Ctrl multi-selection copy their selected lines. Escape clears the selection and restores whole-section copying.

The menu audit covers 157 action commands and 18 explicit default accelerators, with collision checks for macOS, Windows and Linux. Native macOS input verified Undo/Redo, Find/Next/Previous, Go to Line, Save/Save As, opening either file, Compare, preferences and Reload. Custom shortcut capture, validation, persistence and routing have automated coverage. Windows physical keyboard/runtime verification remains pending; this is not a claim that every shortcut was physically exercised on every platform.

Apple Silicon and Intel packaged text-copy/Undo regression suites pass. All three package integrity checks and website download hashes pass.
