# Further Compare 2.52.0

Text comparisons now support UTF-32 LE and BE. Files with a byte-order mark are detected automatically; use Read as for BOMless input. Output encoding and BOM controls support both formats, and saved sessions retain them. Invalid scalar values, incomplete units and oversized output are rejected without replacing existing files.

Folder text rules recognize UTF-32 versus UTF-8 and distinguish normalized text matches from identical bytes. Double-clicked child comparisons decode both sides and inherit the parent rules. Exact-content comparisons and copy operations remain byte-based.

Validation: all 459 unit checks passed. Browser UTF-32 imports, comparisons and exact downloads passed. Both packaged Mac architectures passed native text saves/session restoration and folder text-rule workflows. All three archives passed integrity and source verification; website links, sizes, SHA-256 and a Windows ZIP browser download passed.

Windows runtime verification and broader full-product work remain pending. See [UTF-32 validation](utf32-validation.md) for format details and Unicode references.
