# Further Compare 2.90.0

Saved sessions can be locked and explicitly unlocked from the native Session menu, folder Session & tools context menu, tab context menu, or compact lock control beside the saved session name. Locking changes the saved file's protection flag without saving pending local edits. Compared files remain editable. Save on a locked session opens Save As; the new copy is unlocked. Choosing any locked session as an overwrite destination is rejected by the native save boundary, even if the renderer's state is stale. Saved locks survive reopening; detached workspace copies have no authority to change the original session.

The optional lock flag preserves legacy session compatibility. Writes validate bounded session data, reject final symlinks and hard links, serialize canonical case-normalized aliases, revalidate parent identity and file revision, and install new files without overwriting concurrent creations. Lock toggles preserve the complete existing saved payload. This protects against accidental in-app session overwrite; it is not an operating-system file permission or a lock on compared files.

Validation: 13 lock filesystem tests, 31 session tests and 8 workspace tests passed. Source desktop tests passed for lock/unlock, preserved unsaved edits, tab restoration, cancelled Save As, protected-destination rejection, unlocked copies, reopening, clearing and folder/tab context routes. Compact menu and workspace desktop regressions passed. Final package checks follow below.

Windows runtime and full product parity remain outstanding.

Final verification: both Mac packages passed locking, protected Save As, reopening, folder/tab context routes and clearing. Intel test dispatch synchronization was corrected after timing failures; the completed rerun passed. All three package versions and changed assets matched source, ZIP integrity and download links/sizes/SHA-256 passed, and the Windows ZIP downloaded through the browser. Browser live-text and 10,000-line surface checks passed. Shipped-source branding scan found no reference names.
