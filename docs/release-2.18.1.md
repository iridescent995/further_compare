# Further Compare 2.18.1

Windows modified-time editing now routes through a dedicated native-handle helper for files and directories. The helper pins the root, ancestors and targets, rejects reparse points and duplicate identities, verifies file identities and exact size/write/change timestamps, preflights the whole selection, and uses guarded rollback. Paths are JSON on standard input; filenames never become script source. The helper is included as an external Windows package resource.

The implementation follows Microsoft's [directory handle guidance](https://learn.microsoft.com/en-us/windows/win32/fileio/obtaining-a-handle-to-a-directory) and [SetFileTime contract](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfiletime). Zero FILETIME means no change, so the Windows action rejects the exact 1601 epoch and earlier dates. Filesystem results differing by at least one millisecond are rejected and rolled back. Node identity/time mapping was checked against [libuv's Windows filesystem implementation](https://github.com/libuv/libuv/blob/v1.x/src/win/fs.c).

The launcher validates helper output, bounds input/output size, and reports uncertain outcomes after a timeout instead of claiming rollback succeeded. POSIX timestamp behavior is retained. Access-time tests now let macOS fixture creation activity settle before assigning historical times; their preservation assertions remain strict.

All 147 local unit tests pass. New wrapper tests cover literal Unicode/shell punctuation, malformed responses, failure messages, timeouts, oversized output, changed snapshots and case-insensitive duplicates. A Windows-only runtime suite and CI step cover real files/directories, nested parent/child selections, locked-file preflight, reparse points, scope isolation and date boundaries. It explicitly skips on macOS.

The final Apple Silicon and Intel packages pass the timestamp workflow regression. All package versions and bundled modules match source; the Windows external helper matches its source, and ZIP integrity/download link/size/SHA-256 checks pass.

Windows execution and C# compilation have not been verified on this host: no Windows runtime, PowerShell or C# compiler is available. The helper therefore remains pending native Windows validation. Concurrent metadata-only Windows handles may still race between revision checks; observed revision changes prevent rollback from overwriting them. The full-product scope remains in progress.
