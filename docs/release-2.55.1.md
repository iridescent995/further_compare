# Further Compare 2.55.1

Closing Properties now cancels its folder-size traversal. A trusted cancellation IPC bypasses the serialized folder-operation queue so it can signal an in-flight scan immediately. Cancellation is cooperative: any current filesystem call finishes before traversal stops. Already queued scans from the closed dialog are rejected.

Each Properties response carries an opaque request token scoped to its selected row IDs, side and tree revision. Closing or replacing that Properties request invalidates sizing; stale tokens cannot cancel a newer request. Late UI results remain isolated from newly opened dialogs.

Validation: 473 unit tests passed, including cancellation before any read and during traversal. The Properties suite passed in source and both packaged Mac architectures. A held real directory enumeration confirms Close delivers cancellation while the normal folder queue remains occupied. Stale/forged cancellation tokens and sizing outside the request selection are rejected. Existing metadata, tree-state, focus, alignment and theme checks continue to pass.

All three packaged UI/native sources matched the build and passed ZIP integrity checks. Windows runtime verification remains pending; broader product parity remains incomplete.
