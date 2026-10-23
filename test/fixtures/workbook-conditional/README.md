# Independent conditional-formatting fixtures

Generated with Python openpyxl 3.1.5 using `generate.py`. The baseline and changed files are independent producer output; other cases are explicitly controlled XML mutations. `provenance.json` records producer and SHA-256 hashes. The files contain only synthetic values.

Baseline sheet `Rules` contains expression, cellIs, top10, aboveAverage, colorScale, dataBar and iconSet rules (eight total). A2:A1048576 and empty H1:H1048576 test full-column extents without materializing empty rows. Stored values occupy only four rows. The font in the top10 differential style references theme accent1 with a tint.

- `changed.xlsx`: same cell values; first expression, priority, fill and color-scale percentile differ.
- `renumbered.xlsx`: reverses differential style entries and remaps every rule's dxfId; semantically identical.
- `theme-changed.xlsx`: changes accent1, which a differential style references.
- `unsupported.xlsx`: adds a real x14 conditional-format expression rule with xm:f and xm:sqref, which must be reported unavailable without losing readable cell values.
- `malformed-reference.xlsx`: zero row in B0:B20, unavailable rule projection.
- `paths-prefixes.xlsx`: relocated worksheet and styles parts, relationship/content-type updates and explicit XML namespace aliases. This tests package relationship handling independently of filename conventions. openpyxl's readback assumes the conventional styles path, so this mutation is checked through the application's relationship-aware reader instead.

The generator independently reads baseline, changed, renumbered and theme-changed rules back with openpyxl. No fixture proves evaluation of conditional rules or rendered Excel appearance; the feature compares stored rule definitions.
