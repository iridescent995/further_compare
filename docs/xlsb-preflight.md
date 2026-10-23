# XLSB cached-value preflight

`inspectXlsb(bytes, {DOMParser})` in `src/xlsb-preflight.cjs` is a preflight and
sanitizer, not a general XLSB reader. The caller must pass **`sanitizedBytes`**,
never original bytes, to its isolated candidate reader, and reconcile the returned
nonblank coordinate census and formula provenance against that reader's output.
No input file or input byte buffer is changed.

The returned summary includes ordered sheet names, paths, visibility, populated
extents, all cell coordinates (explicit blank markers), formula cache coordinates
and types, date1904, shared string count and aggregate record/cell counts.
Formula records necessarily include a typed cache. Truncated caches fail; no
formula is evaluated. Reader options remain `cellFormula:false`,
`cellStyles:false`, `bookVBA:false`.

The sanitizer constructs a fresh stored ZIP with only worksheet declarations,
workbook properties, sheet dimensions/rows/cached cells, flattened shared strings,
and number formats/cell XF mappings. Formula records become plain cached cells;
the separate census preserves their identity. No original XML, formula tokens,
phonetic extension, external connection, theme, property, comment, drawing, macro
or binary-index record reaches the reader. Dropping these features is explicit:
this is cached-value comparison, not preserving editing or formula/layout parity.

Before sanitizing, all source ZIP entries undergo existing archive-core structural,
CRC and expanded-size checks; all XML parts use the shared strict XML validator.
Content types and relationship identity/targets are validated, external links are
refused, and workbook/sheet/shared-string boundaries, lengths and counts are
checked. Unknown workbook, sheet and auxiliary binary records are refused.
This is a deliberately supported record profile, with future records requiring
qualification rather than being silently forwarded.

Limits: 32 MiB input, 64 MiB expanded package, 4,096 entries, 1 MiB per XML/record,
1,000,000 records, 64 sheets, 50,000 rows, 512 columns, 500,000 total cached cells
and aggregate rectangular projected cells; 500,000 shared strings, 16 Mi UTF-16
shared-string characters, and 10 Mi projected string characters. Strings are
bounded before decoding; rich-text runs are bounded by record bytes and 32,768
runs. Number-format strings are capped at 4,096 characters; styles at 10,000 records.
A caller-owned worker deadline is still required; these bounds are not a hard
process memory sandbox.

Specification references:
- [MS-XLSB Record](https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-xlsb/7bf1de78-9cda-4002-8411-086f79cd4b60)
- [BrtWsDim](https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-xlsb/81a65821-5dfa-43e1-9f82-92863b836f96)
- [Cell Table](https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-xlsb/33035e84-cb66-4323-a8bc-d45e287bd7ec)

Independent producer fixture and BSD redistribution notice are in
`test/xlsb-fixtures`. Fourteen `test/xlsb-preflight.test.cjs` tests cover independent
package census, immutable source bytes, sanitizer stripping, malformed ZIP/XML,
record lengths, relationship confusion, dimensions, indices, string bounds,
ordered boundaries, formula-cache conversion, mutation during asynchronous reads, and exact cell-XF sequence retention, and all three worksheet visibility states. Invalid style references and mismatched cell-XF counts fail before reader invocation. A qualification run with the pinned SheetJS 0.20.3 reader compared all 96 source/sanitized cell values, types and display strings, including 14 dates; all matched. This does not establish all
Excel versions/records or full XLSB fidelity.

Style validation follows package content type and relationship targets, including nonstandard filename extensions; wrong style content types and malformed renamed style parts are rejected.

The supported number-format identity profile reserves 0–163 for built-in formats. Explicit custom BrtFmt definitions must have unique IDs of 164 or above; every custom ID referenced by an XF must be present. Files redefining built-ins are rejected rather than overwriting date semantics.
