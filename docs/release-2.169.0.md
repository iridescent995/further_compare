# Version 2.169.0

Three-way Text Merge now detects Unicode BOMs and offers explicit input encodings for legacy text. Source edits remain Unicode drafts while original imported bytes stay intact. Saved sessions, side swaps and Undo/Redo retain those drafts. Result encoding, BOM and line endings are selectable; saving rejects characters that the chosen encoding cannot represent.

Shell-launched file comparisons now bind displayed bytes to their original disk revision and identity. A changed or replaced file is rejected before the native session adopts it. Finder service installation rejects nested symbolic links and publishes owned workflow files through atomic replacement.

Source verification: 1,693 tests passed with one skip; targeted shell/installer tests, six staged Automator cases, encoding browser/native tests, and existing merge live/history/context/worker regressions passed. Both Mac packages passed encoding and selected-shell runtime tests. All three packages passed source equality, ZIP integrity and download verification. The Intel encoding fixture required a startup readiness gate before sending menu commands; the corrected test passed. Actual Windows runtime testing is deferred at the user's request. Actual installed Finder menu discovery remains unverified.

The audit found similar read/revision gaps in folder child-open handlers; that follow-up remains pending. These shell changes do not claim to fix those other handlers.
