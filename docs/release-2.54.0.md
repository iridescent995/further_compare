# Further Compare 2.54.0

CLI and desktop batch text comparisons now share the text editor decoder. Auto recognizes UTF-8, UTF-16LE/BE and UTF-32LE/BE BOMs and assumes UTF-8 without a BOM. Explicit per-side choices also support BOMless Unicode, Windows-1251/1252 and Latin-1. CLI flags are --left-encoding and --right-encoding; JSON jobs use leftEncoding and rightEncoding. Encoding options are text-only.

The desktop review shows encoding choices. Changing them after review invalidates the reviewed plan. Text reports include detected sourceFormats (encoding, BOM and line-ending style). Malformed input or a contradictory BOM fails without writing a report. Text jobs now share the editor’s 10 MB limit; binary and table jobs retain 32 MB. Tables continue to require UTF-8.

Validation: all 468 unit tests passed. New fixed-byte fixtures cover UTF-16/32 in both byte orders, supplementary Unicode, BOMless UTF-16, Windows-1251, case rules, malformed data, incompatible mode options and size overflow. Desktop batch tests passed in source and both packaged Mac architectures, including encoding review, changed-encoding rejection and real report output across all four comparison engines. All packages contain matching CLI, decoder and UI sources and passed ZIP integrity checks. Windows runtime verification remains pending.
