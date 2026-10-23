# Legacy text encodings

Text inputs and outputs support `shift-jis`, `euc-jp`, `gb18030`, `big5` and `euc-kr`, alongside the existing Unicode, Windows code-page and Latin-1 choices. Select the input encoding explicitly. Auto continues to detect Unicode BOMs and otherwise uses UTF-8; it does not guess a legacy encoding.

The choices are available in text comparison, three-way text merge, folder text rules, folder patches and CLI/batch text comparison. Folder rules can choose different left and right encodings. Raw folder copying preserves source bytes.

Mappings come from pinned iconv-lite 0.7.2. Shift-JIS uses its Windows CP932 mapping; EUC-KR uses its CP949-compatible mapping; Big5 includes its HKSCS mapping. GB18030 uses that version's mapping tables with strict checks for unassigned four-byte ranges. These labels do not imply every historical or national revision has identical mappings. Upstream documentation: [iconv-lite](https://github.com/pillarjs/iconv-lite), [GB18030 pointer bounds](https://encoding.spec.whatwg.org/#index-gb18030-ranges-code-point).

Malformed bytes, incomplete sequences, unsupported output characters, nulls and unpaired Unicode surrogates fail rather than being replaced silently. Literal Unicode replacement characters remain valid where the encoding represents them. The existing size limits remain in force.

Some valid legacy byte sequences have the same Unicode meaning. The app retains original bytes for these files in their session format metadata. An unchanged save writes those bytes exactly. To save edits, choose **Normalize alternate byte mappings when saving edits**, or select a Unicode output encoding. Normalization changes alternate byte spellings to the encoding's canonical spelling while preserving the edited Unicode text. The choice participates in undo/redo and saved sessions; changing the output encoding clears it and the original-byte metadata.

Folder patches provide a separate, initially unchecked normalization choice. Review identifies affected files. Changing the choice invalidates the previous review. Replaced originals remain in the operation backup. Comparison reports and reusable defaults exclude original-byte metadata.

Third-party license notices ship in `public/text-encoding-notices.txt` and the built application's `text-encoding-notices.txt`.

## Leading bytes and Unicode signatures

An explicitly selected legacy encoding interprets all bytes using that encoding, including prefixes that resemble a Unicode BOM. Auto still detects Unicode BOMs and otherwise selects UTF-8. Explicit Unicode encodings continue to reject a conflicting BOM.

A Unicode output without a BOM cannot safely start with bytes that readers interpret as a BOM: reopening could consume a literal leading character or select the wrong byte order. Such saves are rejected before writing. Enable the output BOM option to preserve the leading character separately from the file signature. Draft editing and session restoration retain literal leading U+FEFF characters.

Local and SFTP text saves decode their encoded output before preparing or publishing a replacement. File readback and external-change checks still run after local publication.

## DOS, Latin-9, Cyrillic and classic Mac files

Explicit input and output choices also include `cp437` (DOS), `cp850` (DOS Western European), `iso8859-15` (Latin-9), `koi8-r` (Cyrillic) and `macroman` (Western European). These are available in ordinary text comparison, three-way merge, folder text rules, folder patches and CLI/batch routes. They are never guessed by Auto. All byte values have defined mappings, but a null byte still rejects a file as binary. Output characters outside the selected profile fail before publication instead of becoming question marks.

The first four mappings use the pinned iconv-lite single-byte tables. MacRoman explicitly uses Apple's Mac OS 8.5-and-later Roman mapping: byte BD is Ω, DB is €, and F0 is the Apple private-use character U+F8FF. Three corrections to iconv-lite's older table follow [Apple ROMAN.TXT c02](https://www.unicode.org/Public/MAPPINGS/VENDORS/APPLE/ROMAN.TXT). The Apple character's appearance depends on the font. Older Macintosh currency/Ohm spellings are not silently substituted.

Independent fixtures in `test/single-byte-fixtures` are generated using CPython's standard codecs. Tests compare every non-null byte against those mappings and verify exact round trips, realistic CRLF text, strict output rejection, source preservation, folder/CLI comparison and actual browser edit/save/undo/session behavior. These five profiles are bijective, so they require no alternate-byte normalization metadata. The existing size limits and document source guards remain in force.
