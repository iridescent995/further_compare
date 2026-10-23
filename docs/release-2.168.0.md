# Version 2.168.0

Finder gains **Compare Selected** for exactly two files or two folders. A native review shows their full left/right paths and offers Compare, Swap and Compare, or Cancel. Cancelling preserves the active session, unsaved text and remembered left selection. Inputs are checked again after review to reject changed types, replacement items or changed symlink targets.

The integration dialog explains the workflow. Existing two-action installations report partial so Enable integration can add the third action. All three service destinations are checked for ownership before installation or removal.

Validation: 22 service/installer tests and source cold/second-instance review tests passed. Both Mac packages passed cold/second-instance compare, swap and cancellation tests. Actual staged Automator execution passed all six file/folder action cases. All three package source/ZIP checks and download link/size/SHA-256 checks passed. Finder menu discovery in the user's Services folder remains unverified; tests do not install services there. Actual Windows runtime testing is deferred at the user's request.
