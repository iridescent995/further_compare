# Further Compare 2.42.1

Tab clicks now wait for an in-progress folder refresh or other renderer operation. Previously, the click was silently ignored. When several tabs are clicked while waiting, the most recent choice wins. Clicking the current tab last cancels an earlier queued switch. A request made during native activation is also honored after activation completes.

Explicit navigation targets a still-existing tab. Session-bound folder commands retain their separate stale-context checks. Draft text and folder browsing state remain in their original tabs.

A regression held real folder-list IPC and reproduced the lost click before the fix. It now passes queued switching, latest-choice behavior, current-tab cancellation, requests during held native activation, preserved drafts and folder rows. Browser tab/session/mobile tests and busy-folder context/native command tests passed. The regression is included in the desktop CI workflow. Both packaged Mac architectures passed the new tab-navigation regression. All three archives passed ZIP integrity and version/source checks. Download links, sizes, SHA-256 and an actual Windows ZIP browser download passed. Windows runtime verification remains pending.
