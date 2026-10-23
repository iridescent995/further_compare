# Release 2.116.1 — Archive keyboard navigation

Archive Compare now has one row in the Tab sequence, with arrow keys, Home/End and Page Up/Down for navigation. Left collapses a folder or moves to its parent; Right expands it or enters its first child. Space toggles selection, Shift extends a range, Ctrl/Command moves focus without changing selection, and Ctrl/Command+Shift adds a range. Enter opens the selected comparison. Single-click selection and double-click opening remain intact.

Async folder results retain the current row focus without stealing focus from dialogs or other controls. Empty trees remain keyboard focusable, collapsed descendants fall back to their parent, and disclosure double-clicks toggle only once. Rows expose their hierarchy and expansion state to assistive technology.

Validation: the previous build reproduced 81 separate Tab stops. The corrected workflow passes source Electron and both Apple Silicon/Intel Mac packages. Browser checks cover delayed results, modal/control focus isolation, additive ranges, empty trees and disclosure double-clicks. Existing archive edit, layout and stale-edit regressions pass. All three ZIPs, packaged versions/renderer assets and download size/SHA-256 checks pass. Windows runtime and physical keyboard checks remain pending; native UI access still reports the Mac locked.
