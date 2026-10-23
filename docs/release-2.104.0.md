# Release 2.104.0 — archive edit history

Archive copy, delete and rename changes can now be undone and redone through the Edit archive menu, right-click menu and native Undo/Redo commands. Each open archive tab retains its own runtime history. Saved sessions retain current archive contents without serializing history. Opening a replacement input clears history; a new committed edit clears redo, while canceled reviews leave it intact.

Restoration parses and compares the requested snapshot before publishing it. Failed or obsolete operations leave current contents and history unchanged. Original disk authority is restored only alongside the exact original input. History is bounded to 100 transitions and 64 MiB of retained decoded archive bytes.

Source validation: 866 unit tests passed, with one Windows-native attribute test skipped. The archive history desktop workflow passed exact exported entry bytes through copy/delete/rename undo and redo, native/context/menu routing, tab isolation, cancellation, redo invalidation and session reopen without history. Workspace restoration and existing archive asynchronous race regressions passed.

Both Apple Silicon and Intel Mac packages passed the complete archive-history workflow. All three package versions and bundled UI matched the build; ZIP integrity, download links, sizes, SHA-256 and browser download checks passed. The shipped-source branding scan found no reference-product names. Windows runtime, contained-file editing/additions, broader archive formats and metadata preservation, remote providers and the remaining full-product scope remain open.
