# Release 2.155.0 — Remote file properties

Status: packaged and verified on both Mac architectures. Windows archive checks pass; actual Windows runtime remains unverified.

View properties works from the existing folder context menu for SFTP files and directories. It shows the encoded server address, selected file byte counts, modification times, POSIX permissions and owner/group IDs. Missing access and creation times are explicitly unavailable. Opening properties reads selected metadata only, without scanning closed folders or reading file contents.

Requests revalidate the selected entries and root, reject stale tree revisions, and support Stop while remote metadata is pending. Mixed comparisons retain native local metadata on the local side. Local-only folder-size calculation remains available; remote folder-size calculation and attribute editing remain unfinished.

Fourteen provider/local properties unit tests pass. Source native, visible SFTP context-menu and local properties workflows pass. All three release archives pass integrity checks, bundled version/source/assets match, and download links, sizes, SHA-256 and the Windows ZIP browser download pass. Shipped branding checks pass.

The release also fixes Stop remaining disabled during the comparison debounce after opening a second root. A deterministic native regression holds the queued timer, confirms zero comparison IPC, reproduces the disabled button on the previous bundle, and passes with the fix. Stop now reflects pending comparison work immediately; cancelled callbacks do not start reads and visible rows remain. The existing queued selected-comparison cancellation regression also passes.

Both final Mac packages pass native remote properties, the actual SFTP dialog/context workflow, local properties with UI alignment, and the queued Stop regression. The no-I/O properties check disables automatic refresh through the UI to isolate the operation. All three final archives, bundled versions/assets, refreshed downloads and shipped branding pass. Actual Windows runtime remains unverified.
