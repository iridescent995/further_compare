# Further Compare 2.18

Select files or folders and choose **Change modified time…** from the folder context menu or native Actions menu. The dialog lists the selected entries and side, accepts a local date/time with milliseconds, and offers **Use current time**. Applying changes only the selected entries; a selected directory does not recursively change its children. Cancel leaves timestamps untouched.

The native operation accepts up to 1000 unique entries within the selected root. It preflights all entries, rejects symlinks and special files, holds file descriptors, checks identities and revisions before writes, preserves access times to filesystem precision, and verifies the stored modified time. If a later operation fails, it attempts to restore earlier timestamps only while the same entries and revisions remain. Incomplete rollback is reported explicitly. Previews and caches are invalidated after success or failure.

The folder view refreshes after applying. Content comparisons remain based on bytes; modified-time comparison methods use the updated timestamps. Dates that the filesystem cannot represent produce an error. Descriptor and filesystem limits can reject large selections without changing entries during preflight.

All 143 unit tests pass. Development integration covers context/native actions, both sides, multi-selection, cancellation, empty input, timestamp/metadata updates, access-time preservation, content versus time rules, directory-only scope and traversal rejection. The dialog was visually inspected.

The integration suite also passes in the final Apple Silicon and Intel Mac packages. All three package versions and bundled sources match this release; ZIP integrity and download link/size/SHA-256 checks pass.

Windows runtime validation is pending. In particular, Windows directory descriptor support for timestamp updates has not been verified and directory operations may be rejected by the OS. Additional timestamp fields, file attributes and the broader full-product scope remain open.
