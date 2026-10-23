# Further Compare 2.181.0

XLSX formatting comparison now resolves major and minor theme font references. Changes to Latin, East Asian, complex-script or supplemental font mappings appear in cell and rich-text formatting differences. Equivalent definitions compare equally even when the scheme label, collection role, script order or cached font name differs. Explicit font choices remain independent of theme changes.

Comparison preserves original workbook bytes. Malformed imports retain the existing inputs, edited result and native file references. Saved sessions recalculate fonts from their original workbook data. Files without font schemes keep unresolved references.

This compares stored definitions, not actual font rendering or glyph fallback. Theme font extensions remain unsupported. See [theme font behavior](workbook-theme-fonts.md).

Source verification: 1,879 unit tests passed, one skipped; new browser and native workflows passed. Existing palette and workbook-preservation browser regressions passed. Both packaged Mac builds passed the new native workflow. All three archives passed source equality, branding, ZIP integrity and download verification. The verified Apple Silicon app is installed at `/Users/harshit/Applications/Further Compare.app`, with2.180.0 retained for rollback. Finder Services registrations remain valid. Windows runtime testing remains deferred.
