# Further Compare 2.6

- Folder trees can expand a subtree or all folders in place, stop expansion, and collapse one subtree without closing others. Expansion is bounded to 5,000 directory reads and 50,000 entries, with a visible limit message. Content comparison continues to operate on expanded nodes.
- Right-click actions include selection criteria, inversion, mask reset, and expansion controls. Filtering or collapsing an entry removes its hidden selection, preventing subsequent Copy/Delete actions from silently including it.
- Light, dark, and system-following themes share a consistent palette across comparison views. Display preferences also control compact/comfortable folder density and text size. Compact rows remain 23 pixels high.
- Changed text lines highlight individual changed characters. Very long or complex lines fall back to line highlighting. Merge actions and text-tool replacements/line copies have bounded undo/redo history retained separately for each open tab.
- Table results support inserting/deleting rows and columns and exporting CSV or XLSX. XLSX output contains edited values in one `Result` worksheet, not original formulas, styles, or workbook structure.
- Audio comparison supports mono/stereo PCM 8/16/24/32-bit and float32 WAV files, with metadata, waveform previews, sample differences, time offset, tolerance, playback, and JSON report export. Sample rates and channel counts must match. Compressed formats and resampling are not supported yet.

The full-product scope remains active in `implementation-plan.json`. This release does not claim complete parity.
