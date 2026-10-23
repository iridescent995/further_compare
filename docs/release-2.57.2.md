# Further Compare 2.57.2

Folder-size calculation no longer aborts solely because a file's access time changed between metadata reads. Size, identity, ownership, permissions, modified/change time and birth time remain checked. The Properties metadata reader keeps its access-time consistency check because it actually reports that value.

A deterministic stat fixture reproduces the old failure with access-time-only changes. It now verifies the correct byte total and confirms that changes to size, inode, modified time, change time or permissions are still rejected. This demonstrates and fixes a real edge case; it does not establish the precise cause of the earlier intermittent folder-size failure.

All 475 unit tests and the source folder Properties desktop workflow passed.

Both packaged Mac architectures passed the Properties workflow. All three package versions, application bundles and native Properties modules match the source build. ZIP integrity checks passed. Windows runtime verification remains outstanding.
