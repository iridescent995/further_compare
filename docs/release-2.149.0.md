# Release 2.149.0 — Folder comparison cancellation and provider foundations

Folder Stop now cancels tracked native reads, preserves loaded rows and prevents automatic comparison restart until an explicit retry. Cancellation tickets bind the originating session, tree revision and request. Stale Stop requests cannot cancel replacement work. Selected compare/refresh uses the same cancellation path; routine expansion changes do not persistently pause background comparison.

Refreshing/replacing a tree and closing a session also abort obsolete reads. Ordinary tab activation preserves pending work. A native regression exposed the shared IPC queue blocking cancellation behind the read it needed to stop. Tree reads now start after earlier transactions and release the queue while continuing to be tracked; file-changing operations remain serialized.

Folder tree metadata, filename inventory, immediate paired listing and content comparison now use provider interfaces. Local readers retain no-follow opening, exact timestamps, handle/path/root validation, raw and normalized comparison rules, and bounded text buffering. Content caches and row updates publish only on success; weak revision evidence bypasses cache reuse. These are foundations for remote folders, not a released SFTP connection feature.

Source verification includes 164 focused Stop/regression tests, scheduler/lifecycle checks, existing native queue checks, and actual desktop tests of reader cancellation/closure, retained rows, retry, stale tickets and tab switching. Build succeeds. Both Apple Silicon and Intel Mac packages pass Stop, lifecycle, queued-selected Stop and folder-tree workflows. The queued-selected test uses the actual menu command and Stop button, verifies that no selected native comparison starts afterward, and retains visible rows. All three ZIPs pass integrity checks; packaged versions and changed UI/native assets match the final source. Download links, sizes, SHA-256 checksums and the Windows ZIP browser download pass. Shipped branding checks pass.

Actual Windows runtime, explicit remote connections/transfers and the remaining full-product scope are outstanding.
