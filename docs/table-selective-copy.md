# Selective table value copying

Open two CSV, TSV or XLSX inputs, choose header/key settings, then choose **Use left as result** or **Use right as result**. Click a comparison cell or row number to select it. Cmd/Ctrl adds selections; Shift extends a range. Use **Copy left cells to result** or **Copy right cells to result**, also available from the context menu.

Copies use original comparison row coordinates, including key-aligned rows in a different order. Editing a result key does not redirect subsequent copies. Undo/Redo restores both values and row mappings. Saved sessions preserve the mapping; default settings do not retain result data.

A missing destination row requires selecting its whole comparison row. Copy appends it to the result. A missing source row cannot delete a result row: use Delete row explicitly. Changing inputs, sheets, keys, delimiter or header settings requires initializing a result again before copying. Manual column insertion/deletion clears the mapping; undo restores it.

Version 2.189 supports ordinary formula and typed-value copying into XLSX results; see [Typed workbook edits](workbook-typed-edits.md) for scope and limits. Copying does not transfer source formatting or worksheet layout. **Save workbook copy** preserves the selected original workbook, untouched formulas, destination styles and other sheets. Writing a previously empty cell at its existing coordinate is supported. Inserting/deleting rows or columns requires exporting values instead; undoing those structural edits restores workbook-copy eligibility. Original files remain unchanged.
