# Version 2.166.0

Recovery backups for remote copy replacement, Rename and Delete now sync directory entries after verified backup contents and manifest publication on supported POSIX filesystems. The operation directory, recovery root and ancestor directories are checked by identity around flushing. Unexpected failures stop the operation before remote mutation. Filesystem flushing is not a guarantee against every hardware failure.

Windows retains content syncing and existing operations. Native confirmation, results and retained history explicitly report that this build cannot flush recovery directory entries, so recovery after sudden power loss is not guaranteed.

A dedicated Mac ARM/Intel/Windows safety CI matrix checks source and packaged selected-line copying, Undo and SFTP safety, with bounded test steps and retained logs. Screenshot paths are portable. Actual Windows execution remains outstanding because this checkout has no configured remote or Windows runner.

Priority order remains reliability/data safety, Finder/Explorer integration, text comparison, spreadsheets, then archives.

Validation:47 focused/actual-SFTP tests, source deletion UI and persisted history, both packaged Mac safety suites, all three package integrity/source checks and download hashes pass.
