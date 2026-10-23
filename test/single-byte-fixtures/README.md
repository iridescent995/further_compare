# Independent single-byte encoding fixtures

`generate.py` uses only CPython's standard-library codecs; it does not import the application or iconv-lite. `profiles.json` records the producer version, every byte's Unicode scalar mapping, and exact realistic CRLF sample bytes for CP437, CP850, ISO-8859-15, KOI8-R and MacRoman. Regenerate with `python3 test/single-byte-fixtures/generate.py`.

Production uses pinned iconv-lite 0.7.2 tables plus the three Apple Mac OS 8.5+ Roman corrections documented in `src/single-byte-text-codec.cjs`. Independent comparison covers all 256 mappings. NUL's mapping is checked through the fixture but the application deliberately refuses NUL-containing text as binary; bytes 1–255 must decode and encode byte-for-byte. No locale detection, best-fit substitutions or implicit Unicode normalization are used.
