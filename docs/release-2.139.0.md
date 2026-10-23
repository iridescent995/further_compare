# Release 2.139.0 — Audio context actions

Audio comparison now exposes its actions through a shared toolbar and right-click menu: open either input, listen together, pause both, save a report, and focus offset or tolerance settings. Shift+F10 and the context-menu key open the menu from either pane. Escape and actions restore focus. Native audio and input context menus remain available. Pending imports keep replacement pickers available while disabling actions that require completed data. Captured stale actions cannot operate after reset, replacement or a newer menu.

Playback request generations prevent an intentional pause, reset, source replacement or newer playback request from producing a false error notice. Genuine current playback errors remain visible. The regression tests distinguish intentional cancellation from unpaused failures.

Validation: 1,160 unit tests passed with one platform-specific skip. Focused browser tests cover menu availability, keyboard access, stale callbacks, overlapping pickers and deferred playback errors. Source native and both final Mac packages passed actual input pickers, playback, report writes, unchanged source bytes, focus restoration and light/dark menu placement. Visual inspection caught the quick-pause error and confirmed the fix. All three ZIP integrity checks, packaged version and final UI asset comparisons, download links/sizes/SHA-256 and Windows ZIP browser download passed. Shipped branding checks found no matches.

Windows is packaged but actual Windows runtime testing remains outstanding. This release does not establish full-product feature parity.
