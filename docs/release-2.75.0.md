# Further Compare 2.75.0

The shared interface now uses soft mint, peach, lilac, rose and cream buttons. Buttons and desktop launch cards use borderless surfaces, with distinct keyboard focus indicators. Light mode has lighter near-white pastel backgrounds; dark mode retains dark surfaces with lighter pastel controls and dark button text/icons. Semantic filenames remain darker in light mode and readable against dark-mode status backgrounds. The theme is shared by browser, macOS and Windows builds.

File action history now also records rename, file/folder creation and modified-time changes, including native failures and the requested paths/time. Cancelled name/time dialogs and invalid form submissions do not claim file actions occurred. Successful multi-file timestamp changes use the native changed count.

A failed creation could invalidate native tree IDs while leaving the renderer stale, causing the next action to fail. Failed direct file actions now refresh the tree before the error is reported, so a subsequent action can proceed with fresh IDs. Logging distinguishes the original failure from success and preserves guarded native operations.

Source rename, creation and timestamp regressions passed, including existing-name rejection followed by successful creation, path remapping and protected edits, cancelled/invalid time inputs, multi-selection, side isolation and history outcomes. The appearance agent checked browser persistence/layout, pastel button luminance and text contrast, and actual desktop screenshots. Both Mac packages passed creation, rename and timestamp checks. Package versions/source, ZIP integrity and download checksums passed; final appearance validation is recorded in implementation-plan.json.

History remains app-run only; three-way-output logging, full product parity and native Windows verification remain incomplete.
