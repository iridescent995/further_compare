# Further Compare 2.24.0

Select a binary difference with Previous/Next difference, then choose Copy difference to right. The selected range is mapped from aligned display positions into actual file offsets, so copying can insert, delete or replace bytes without changing unrelated ranges. The copy summary shows the right-side byte count and offset plus the replacement byte count and left-side offset. A range crossing a page boundary is copied in full.

Changes remain in memory until Save result. Undo edit restores both structural changes and single-byte edits in order, retaining up to 100 edits and 32 MB of replaced bytes. The resulting file is bounded to 32 MB. Opening another input clears selection and undo history. Both files must be opened before difference copying is enabled; an opened empty file is valid.

Arbitrary byte-range selection and redo remain pending. All 184 unit tests passed. Native development checks passed for insertion, deletion, replacement, empty output, selected-range-only copying, a range crossing a page boundary, mixed structural/byte undo, exact saved bytes and unchanged source files. Existing alignment and advanced comparison workflows also passed.

The copy workflow passed in both final macOS packages. The save assertion now waits for asynchronous file creation before reading output. All three desktop packages contain the updated UI and passed ZIP integrity checks. Windows runtime validation remains pending on a Windows host.
