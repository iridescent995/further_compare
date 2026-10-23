# UTF-32 text support — development validation

The shared codec now supports UTF-32 little- and big-endian files. Four-byte BOMs are checked before UTF-16 BOMs. BOMless input requires explicit selection; Auto continues to use UTF-8 when no BOM exists. The input/output controls expose both formats on both sides, and saved sessions use the same shared format validator.

Each complete four-byte unit must be a Unicode scalar value. Surrogates and values above U+10FFFF are rejected. The editor's existing null-character and 10 MiB limits remain in place. Supplementary characters, embedded U+FEFF and mixed line endings round-trip without replacement.

References: [Unicode encoding and BOM FAQ](https://www.unicode.org/faq/utf_bom.html), [Unicode scalar and encoding definitions](https://unicode.org/versions/Unicode17.0.0/core-spec/chapter-3/).

Validation completed:

- Eight text-codec tests, including fixed byte fixtures, BOM precedence, subarray offsets, supplementary characters, malformed units, invalid scalars and limits.
- Browser import for both byte orders with and without BOM, comparison against UTF-8, exact download bytes, and preservation after rejected input.
- Existing native encoding regression extended with UTF-32 open, exact Save As, session save/reopen and exact resave for both byte orders.

Included in the 2.52.0 archives. Both packaged Mac architectures passed native encoding and folder text-rule suites. All archives and website downloads passed integrity verification. Windows runtime checks remain pending.

Folder integration validation also passed for UTF-32 LE/BE against UTF-8: normalized match colors/provenance, reports, inherited whitespace rules in double-clicked child comparisons and return to the folder tab. Content mode continues to report byte differences. Malformed UTF-32 falls back to exact-byte folder comparison. All 459 unit checks passed.

The existing folder report test was updated to inspect the current pathA/pathB fields, including its unopened-descendant check, instead of the obsolete single path field.
