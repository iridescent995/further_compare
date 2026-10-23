# Further Compare 2.40.0

Explicit Windows-1251 (Cyrillic) input and output are available in both text panes. Decoding follows the Unicode CP1251 mapping; undefined byte 0x98 is rejected. Output rejects unrepresentable characters before replacing a target file. Windows-1251 does not support a BOM. Auto remains UTF-8/BOM based.

The shared codec supports browser import/comparison and native saves, including session restoration. Browser text Save As is not implemented. Folder automatic text comparison continues to use UTF-8/BOM-based decoding and falls back to byte comparison for unsupported input.

428 unit tests passed. Native encoding integration verified byte-exact saves, saved-session reopening and preservation of an existing target after lossy output rejection. Browser import/UTF-8 comparison and undefined-byte rejection passed. 428 unit tests passed. Both packaged Mac architectures passed the native encoding suite including Windows-1251 byte-exact save, session reopening and lossy-write protection, plus existing encodings, line endings, tabs and external reload. All three archives passed ZIP integrity, version 2.40.0 and 52 source/resource checks. Download links, sizes, SHA-256 and Windows ZIP browser download passed. Windows runtime remains unverified.
