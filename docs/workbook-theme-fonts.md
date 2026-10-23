# Workbook theme font comparison

With Compare formatting enabled, XLSX cells that reference a major or minor theme font compare the referenced font collection. This includes the Latin, East Asian and complex-script typefaces, optional typeface classification attributes, and supplemental script-to-font mappings. Rich-text run fonts use the same resolution.

The comparison resolves each workbook's own theme relationship. A cached font name does not hide a change to a referenced theme font. Equivalent major/minor collections compare equally; unrelated changes to an unused collection do not affect explicit fonts. Files with no font scheme retain their unresolved font reference rather than inventing a font.

This compares stored formatting definitions. It does not simulate script selection, font availability, fallback glyphs, layout or conditional formatting. A supplemental mapping change can therefore appear as a formatting difference even when the current cell text does not use that script. A theme collection and a single explicit font remain distinct because the collection can carry other scripts and classification attributes.

Source workbook bytes and preserved-workbook export remain unchanged by comparison. Malformed or ambiguous theme font definitions are rejected before replacing the active input, result or disk reference.

The implementation follows the [SpreadsheetML font scheme definition](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.fontscheme) and the [DrawingML font scheme](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.fontscheme).

Font scheme and collection extensions are explicitly unsupported; imports containing them fail with an actionable error. Theme typeface metadata uses DrawingML signed-byte charset/pitch values, which differ from SpreadsheetML font charset attributes.
