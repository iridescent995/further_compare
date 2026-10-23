# Further Compare 2.17.2

Folder activation now survives an active refresh: double-click, Enter, single-click disclosure, Rename and Delete keyboard commands wait for the current operation. The same session/root/focus/selection checks used by menu commands prevent queued actions from acting on changed targets.

Choosing a new comparison also waits for startup/file-manager request checks, so early welcome-screen clicks are no longer dropped.

Tree navigation supports Right Arrow to expand or enter an expanded folder's first visible child, and Left Arrow to collapse or return from a file/collapsed folder to its visible parent. Ctrl/Command moves focus between parent and child without changing selection; Shift retains range-selection behavior. Flat and recursive file views do not apply hierarchical navigation. Repeated queued expansion keys request an expanded state instead of repeatedly toggling it.

The deterministic desktop regression verifies queued double-click and Enter each open exactly one child comparison, stale activation cancellation, inline disclosure in the same view, repeated expansion, parent/child navigation, modifier focus behavior, and the existing queued menu and immediate Stop cases. Existing folder-selection and folder-view suites also pass in development.

Final Apple Silicon and Intel Mac packages pass the expanded regression, including a held launch-request poll during a welcome-screen click. Browser startup verification also passes. All three package versions and bundled sources match the release, and ZIP integrity checks pass.

Windows runtime verification and the broader full-product feature scope remain open.
