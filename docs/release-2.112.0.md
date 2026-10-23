# Release 2.112.0 — table result history and archive import readiness

Table results support undo/redo for choosing a source, editing cells, and inserting or deleting rows and columns. Continuous typing in a cell is grouped into one edit. Native commands and toolbar actions use the same history.

Each tab retains bounded runtime history; saved sessions contain only current results. Replacing an input clears its result history. Undo in an archive child changes the result locally until the user applies it to the parent archive.

Archive entries and edit/export actions are disabled while a replacement source is being picked, decoded or restored. Concurrent source pickers remain supported; only the owning request clears its pending state, and completion does not replace ready rows.

Validation: 902 unit tests passed; one Windows-native test skipped. Isolated table/binary runtime and archive import-race checks passed. Source table-history, table archive apply, binary history and live text/layout checks passed. Both Apple Silicon and Intel Mac packages passed table history and live editable text/wrap workflows. Actual Mac keyboard input verified Command-F, Escape and wrap control. Light/dark text and options layouts were reviewed. All package versions/assets match source and all three ZIP integrity checks passed.

One intermittent archive reimport double-click stress failure remains unexplained; subsequent traced runs passed 30, 30 and 100 iterations. The explicit import-readiness workflow passes. Full-product scope and Windows runtime validation remain open.

Final distribution checks passed: all three download links, file sizes, SHA-256 hashes and the Windows ZIP browser download. No reference branding was found in shipped source.
