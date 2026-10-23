# Version 2.172.0

Finder integration now detects damaged service metadata and workflow actions, including stale or inconsistent app paths. The setup dialog offers **Repair integration** for owned actions that need repair. Unrelated services remain protected.

A macOS Services refresh failure is visible and offers **Retry activation** or **Retry removal**. Pending failures survive closing and reopening the dialog within the same app window and clear after a successful refresh. Status describes installed integration files without claiming Finder menu discovery.

Source validation passed: 1,718 unit tests (one skip), an additional runtime refresh-failure test, browser repair/retry tests, and native shell routing. Both Apple Silicon and Intel Mac packages passed isolated install, damage, repair and removal workflows. All three packages passed source/static, ZIP integrity and download checks. The integration dialog was visually inspected for readability and layout. Actual installed Finder menu discovery remains unverified. Windows runtime testing remains deferred at the user's request.
