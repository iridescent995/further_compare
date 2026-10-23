# Further Compare 2.17.1

Folder right-click commands and native folder-menu commands now wait for an active operation to finish instead of silently dropping clicks. Queued commands verify the session, roots, focus and selection before running. If those targets change, the command is cancelled with a notice to choose it again. Stop Expanding remains immediate, including while another command is pending.

A deterministic desktop regression test holds actual directory requests and verifies queued context/native Copy Paths, cancellation after selection changes, and immediate Stop Expanding while both directory and command requests are pending. Existing folder-selection and comparison-rule integration tests also pass.

The new regression passed in development and in both packaged Mac architectures. All 136 unit tests pass. The Mac and Windows package versions and bundled sources match this release; all three ZIP integrity checks passed.

Windows runtime validation and the remaining full-product feature scope remain open.
