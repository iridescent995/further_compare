# Further Compare 2.57.1

Selected-node comparison now refreshes the folder row's own metadata and native validation record alongside its immediate children. The Last modified column updates after directory changes, and Properties can use the refreshed directory without requiring a full-tree refresh. File identity/type checks still reject replacement directories.

The regression failed before the fix with the old Last modified text after an explicit timestamp change. It now checks the updated date and opens Properties after node comparison. A native unit test verifies stable row identity, updated metadata/version, successful resolution and detachment of returned data from native authority. The existing 16 native-tree cases also pass.

Both final Mac packages passed the node regression, including the parent modified date and Properties. The full suite passed all 474 tests on recheck. Its first run reported a file-revision change in the unrelated folder-size test; that test passed in isolation and on the full recheck. The underlying intermittent cause was not established. All three packages contain matching versions, native tree modules and application bundles, and passed ZIP integrity checks. Windows runtime testing remains unavailable.
