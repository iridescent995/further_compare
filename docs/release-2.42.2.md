# Further Compare 2.42.2

Tab close buttons and Close Session now wait for an active renderer operation instead of dropping the request. Each request captures the intended tab. Repeated close requests for that tab are combined while its close or unsaved prompt is pending.

The existing unsaved-session prompt remains authoritative. Cancel preserves the tab and draft. Cancelling the native Save dialog keeps the prompt and tab open; a successful Save writes the session before closing. Discard closes only the requested tab.

The held-IPC regression failed before the fix and passes afterward. It covers background and active close requests during refresh, duplicate requests, Cancel, cancelled Save, saved text content and Discard, alongside the previous queued tab-switch cases. Browser tab/session/guard/mobile tests passed. Both packaged Mac architectures passed the extended tab-navigation/closing regression. All three archives passed ZIP integrity and version/source checks. Download links, sizes, SHA-256 and an actual Windows ZIP browser download passed. Windows runtime verification remains pending.
