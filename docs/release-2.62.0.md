# Further Compare 2.62.0

Desktop text drops now retain native disk paths and use the validated text reader. Dropped inputs support Reload, external editors and normal disk change tracking, while preserving detected encoding/BOM/line endings. Previously the renderer loaded a memory-only File and discarded its path. Browser imports continue to decode local File data without native APIs.

One file per side is accepted; multiple-file drops report a clear message instead of silently taking the first file. Text drops use the operation queue. The new native path operation validates absolute paths and reads regular files with the existing size and read-stability checks before loading the side.

The native regression uses OS-backed file drag events and verifies both sides, disk paths, UTF-16/BOM/CRLF preservation, external-editor path, disk reload, invalid-directory/multiple-file rejection and exact saved bytes. Browser encoding regression passed. The test is included in desktop CI.

Both packaged Mac architectures passed the native text-drop regression, including invalid path rejection. All three package versions and changed resources match source; ZIP integrity checks passed. Windows is cross-built but runtime-unverified. Manual Finder dragging remains unverified while the desktop is locked; tests use real OS-backed file objects through Chromium drag events.
