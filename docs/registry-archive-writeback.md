# Registry-file results in archives

Status: packaged, verified and installed in 2.211.0. Version 2.210.0 is retained for rollback. The frozen source suite passed 2,480 tests with one skipped and no failures. Both Mac package workflows and all three static package audits passed; Windows runtime remains deferred.

Open an existing `.reg` entry from Archive Compare to create a linked Registry Compare child. Initialize or edit its result, then use the linked-side **Apply to archive** action. The action is available from the toolbar, registry context menu, and applicable application commands. Review the target archive entry and confirm before applying.

Applying replaces only that existing entry in the parent archive's in-memory draft. The parent has its own Undo and Redo history; undoing the archive change retains the registry child's edited result. Export the parent archive explicitly to save a new archive file. Neither applying nor undoing writes to the original archive on disk, and unrelated entries retain their contents.

## Result validation

The result is parsed as registry-file text, serialized by the existing registry encoder, and validated again from its encoded bytes. Output is UTF-16LE with a BOM and must fit the existing 10 MiB registry-file limit. Unicode names and values, typed byte values, value deletion directives, and deleted keys remain registry-file data. Invalid text, unreadable Unicode, and oversized encoded results are rejected before archive mutation.

This workflow creates and compares `.reg` files. It never imports values into the operating-system registry.

## Linked-entry authority and stale reviews

Writeback requires a live, runtime-only link to an existing supported `.reg` entry. Saved sessions retain comparison data and edited results but do not restore writeback authority; reopen the entry from its archive to establish a new link.

The apply review binds the current child result, input-read generation, entry identity, and parent archive state. Editing the result, beginning a replacement input read, switching/replacing inputs, or changing the parent can invalidate that review. A canceled input read does not make an earlier review valid again. After review, the application checks those bindings again before staging and publishing the archive draft. A stale or missing target requires reopening/reviewing rather than silently choosing another entry.

Encrypted and unsupported parent archive targets remain ineligible. This feature does not add new entries, restore writeback authority from a session, perform an implicit disk save, or enable picture/audio writeback.

## Source acceptance evidence

- `test/registry-archive-result-browser.cjs`: UTF-16LE/BOM output, Unicode and deletion directives, malformed/oversized/unreadable result rejection, shared export validation, opaque result bindings, pending/canceled/replaced input handling, and toolbar/context actions.
- `/private/tmp/fc-archive-registry-browser-frozen.log`: actual archive-child routing, cancel/invalid/stale reviews, repeated-click single history, parent undo, session authority loss, source replacement, and immutable originals.
- `/private/tmp/fc-archive-registry-desktop-final.log`: native reviewed cancel/apply, exact Unicode/types/deletion output, unrelated/source preservation, parent undo/redo, child draft retention, session isolation, and input-replacement invalidation.

The existing archive-entry staging and binary-child writeback regressions also passed (`/private/tmp/fc-registry-stage-regression.log`, `/private/tmp/fc-registry-binary-regression.log`). Final source maps match the app and registry editor sources. The full-suite log is `/private/tmp/fc-archive-registry-full.log`.

These checks establish the stated source workflows. They do not establish packaged release acceptance or full archive/product parity. Windows runtime testing remains explicitly deferred.

Release acceptance: both Mac packages passed registry archive roundtrip and shell workflows. Package source/map/signature/ZIP checks and download hashes passed. Intel testing exposed early test commands before native save completion; acceptance now observes save and history completion before continuing. Both final workflows passed without product changes.
