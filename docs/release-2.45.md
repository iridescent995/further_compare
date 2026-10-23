# Further Compare 2.45.0

Folder lists now support Page Up and Page Down. The focused row moves by the visible pane height, accounting for headers, row density and missing-side entries. Shift extends a selection; Ctrl/Command moves focus while preserving the selection. Navigation stops at the first and last selectable entries. Focused rows remain below the sticky pane and column headers during scrolling.

The desktop regression check covers both panes, compact and comfortable density, missing-side gaps, viewport visibility, selection modifiers and boundary behavior. It detects the missing behavior in 2.44.1. The expansion test now honors the selected packaged executable and waits for root loading before opening a context menu.

Final package validation passed on Apple Silicon and Intel Mac. All three packages matched source and passed ZIP integrity and download checks. Windows runtime verification remains pending.
