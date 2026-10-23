# Release 2.146.0 — Live three-way source editing

Three-way source edits now update session state immediately and recompute after a short typing pause, without requiring blur. Source focus, caret, selection and scroll are restored after recalculation. Composition event listeners keep the active input intact until IME composition ends. Pending recalculation disables stale result saving and conflict operations.

Undo/redo snapshots include source inputs, conflict choices and merged output, so changing a source can be undone back to a manually edited or intentionally empty result. File replacement retains its existing history-reset behavior. Source-content caching avoids redundant merge computation when only output, choices or presentation changes.

Wrap text applies to all source and result editors and persists through saved sessions, tab switches and swaps. Its boolean value is validated when loading sessions, and the context menu exposes the same setting.

Source checks pass: new live merge browser/native tests, existing merge history/browser/native and context/browser/native tests, advanced session swap integration, 38 session validation tests and 15 merge-engine/history tests. Coverage includes pre-debounce snapshots, latest typed source persistence, stale timer invalidation, pending save rejection, real key input without blur, exact UTF-8 exports, manual-result undo and unchanged original files. The deterministic IME test exposed unsupported event-property registration; explicit composition listeners fix it. Long-line wrap screenshots were inspected.

Both final Mac architectures pass live-merge and merge-history native tests. All three ZIP integrity checks pass, packaged versions/UI assets/session validation match, and download links/sizes/SHA-256/Windows browser download pass. Shipped branding scan has no matches. Actual Windows runtime and remaining full-product scope are outstanding.
