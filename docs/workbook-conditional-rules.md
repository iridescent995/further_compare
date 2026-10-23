# XLSX conditional-format rule comparison

Status: packaged, verified and installed in release 2.208.0. Release 2.207.0 is retained for rollback.

In Table Compare, enable **Compare conditional rules** for the selected XLSX sheets. The separate rule section reports differences in applied ranges, priorities, formulas, operators, thresholds and resolved differential formatting. It includes ranges over empty cells and whole columns without expanding them into cell grids. Differences have side-by-side details and pagination. Values, formulas, base cell formatting and layout remain separate comparison options.

The reader uses worksheet/styles/theme XML resolved through package relationships. Workbook-local differential style IDs are replaced by their definitions. Namespace prefixes, attribute ordering and supported explicit defaults normalize; applied range ordering, multiplicity, formula text and anchor context remain significant. Theme colors/fonts and supported indexed colors participate in style comparison. The implementation compares stored rules; it does not evaluate formulas, calculate conditional appearance or claim visual equivalence.

Classic expression, cell comparison, top/bottom, average, text, date-period, duplicate/unique, blank/error, color-scale, data-bar and icon-set rules are handled within validated bounds. Unsupported extensions, pivots, missing referenced definitions, invalid or duplicate priorities and malformed rule structures produce **comparison unavailable**, never an empty successful comparison. Non-XLSX inputs do not acquire conditional-rule support. Unknown extension rules leave ordinary workbook values readable when the package itself is admissible.

The preference survives sessions and Table Compare defaults. Rule metadata is reconstructed from original workbook bytes. This feature does not add rule copying or editing: existing cell-format copying remains base-format only. Supported preserving exports retain original rule/style/theme XML; separate value exports retain their existing limitations.

A parser-only normalization fix explicitly binds default SpreadsheetML namespaces and relationship prefixes for browser XML serialization. A narrow admission exception recognizes Office extension conditional formulas without relaxing namespace checks for worksheet cell formulas. Original package bytes remain authoritative for sessions and exports.

Validation: 2,439 passing unit tests and one skipped; independent openpyxl 3.1.5 fixtures and provenance; actual browser and native workflows; style-ID equivalence, theme changes, arbitrary paths/prefixes, unavailable cases, pagination, sheet switching, session reopening, swapping and preserving exports. Both no-op and edited-cell exports preserve rule definitions, and original files remain unchanged. Both Mac packages passed conditional-rule and shell-helper workflows; all three package source, asset and ZIP audits passed. Installed startup, exact assets and Finder Services checks passed. Windows runtime testing is deferred.

References: [Spreadsheet conditional formatting](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/working-with-conditional-formatting), [Office 2010 conditional rule schema](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.office2010.excel.conditionalformattingrule?view=openxml-3.0.1).
