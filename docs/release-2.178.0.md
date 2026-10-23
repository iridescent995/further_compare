# Version 2.178.0

File manager integration detects missing or non-executable Mac app targets and damaged Explorer menu labels, submenu metadata, selection behavior and commands. Windows status forwards the repair flag to the setup dialog. Windows runtime verification remains deferred.

New Finder services are built completely in a hidden staging directory, then promoted with an identity-checked exclusive rename. Failure cannot overwrite an unexpected destination or publish an incomplete service that blocks a later installation. Existing owned workflows remain repairable after interrupted updates; uncertain hidden staging content is retained rather than deleted.

Verification: 1,839 unit tests passed (one skipped), including fault injection and collision protection. The setup browser regression passed. Both Mac packages passed isolated service creation, metadata repair, missing-target detection and scoped removal using their packaged native helper. All three packages passed bundled-source, ZIP-integrity and download checks.

Actual Finder Services-menu discovery and all three actions passed for files and folders using installed 2.177.0: both two-step comparisons and selected-pair order review, including swapping sides. Existing test tabs were preserved and fixture bytes stayed unchanged. See [runtime evidence and scope](finder-runtime-validation-2.178.md).

After closing the test app, `~/Applications/Further Compare.app` was updated to verified 2.178.0. Its package bytes and all three service registrations were checked. The prior app is retained at `~/Applications/.Further Compare.previous-2.177.app` for recovery.
