# Further Compare 2.38.1

Folder context actions restore keyboard focus to the originating row or empty pane before running. Copy paths and selection actions now allow immediate arrow-key navigation, and dialogs opened from the menu return focus to the tree.

Menus capture their opening context. If selection, roots or session changes while a menu is open, its stale command is rejected with a request to reopen the menu. This prevents an old captured selection from being used after native Select All. Immediate Stop remains available during pending operations.

Source regression checks reproduced focus loss before the fix and verified focus restoration, dialog return, stale menu rejection, reopening with the full selection, and existing busy-refresh actions. Both packaged Mac architectures passed context-menu and busy-refresh suites, including focus restoration, stale menu rejection, reopening with current selection, queued activation and immediate Stop. All three archives passed ZIP integrity, version 2.38.1 and 52 source/resource checks. Download links, sizes, SHA-256 and Windows ZIP browser download passed. Windows runtime remains unverified.
