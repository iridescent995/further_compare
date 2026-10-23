# Workbook formatting copy

Available in 2.190.0.

Choose an XLSX input as the result, select comparison cells or rows, then choose **Copy left formatting to result** or **Copy right formatting to result**. The same commands appear in the result context menu. Keyed comparisons map the source row to its corresponding result row. Formatting copies require existing result rows and columns.

The operation copies base cell formatting: fonts, fills, borders, number formats, alignment and protection. It leaves result values and formulas unchanged. A pending count identifies the copied cells; the grid does not render a formatting preview. Use **Save workbook copy** to export the result. Undo/redo and saved sessions retain the formatting choices. Supported archive child workbooks can return their edited result to the parent archive.

Exports import and remap style records rather than copying workbook-specific style IDs. Source theme/indexed colors are resolved without replacing the destination theme. Style-only changes preserve cached formula results and calculation-chain parts. Changes to values or formulas retain the existing recalculation behavior. Unrelated package parts remain byte-identical.

## Current limits

- Conditional formatting, table styles and rich-text run formatting are separate from base cell formatting and are not copied.
- Differing theme font schemes and unsupported style extensions are rejected before recording the change.
- Workbooks currently require valid existing style parts and the supported transitional spreadsheet XML namespace.
- Protected formula groups, metadata-bearing cells and subordinate merged cells retain the exporter's existing safeguards.
- Inserting or deleting rows/columns cannot yet preserve copied formatting. **Use values only** explicitly removes workbook formatting and formula provenance; that conversion is undoable.
- Saved selections bind to the original workbook bytes and sheet names. A missing or changed source is rejected rather than applying style IDs to a different workbook.
