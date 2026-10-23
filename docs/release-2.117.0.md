# Release 2.117.0 — More space for folder contents

Folder Compare now groups comparison rules, tree/sort settings, pairing/alignment, operation scope, reports and snapshots in a Filters & options dialog. Paths, navigation, search/masks, selection, color legend and expand/collapse remain visible. Existing control elements and handlers are retained, so context/native actions and session state continue to share the same implementation.

At 1440 × 928 the first file row starts at 269 px instead of about 378 px, recovering about 109 px (roughly five rows) for the list. The dialog uses borderless pastel sections in light/dark themes, closes on workspace changes, and supports Done/Escape focus restoration. Actions opening another dialog close Options first, returning focus to a visible control afterward.

Source validation passes actual comparison/view changes, nested encoding/report dialogs, focus restoration, inline expansion, file click semantics, checkbox-free three-column rows and responsive dialog geometry at 1440 × 928, 1024 × 768 and 800 × 600. Light/dark screenshots were inspected. Updated existing rule/encoding tests use the visible Options workflow; child-defaults, case/encoding, selection, disclosure and grouped context-menu checks pass.

Both Apple Silicon and Intel Mac packages pass the complete options/geometry regression. Intel assertions completed successfully but Electron teardown stalled; the owned test process was terminated, and the test exited successfully. All three package versions and renderer/CSS assets match, ZIP integrity and download size/SHA-256 checks pass, the Windows ZIP downloads in the browser, and shipped sources contain no reference-product branding. Windows runtime and full-product scope remain open.
