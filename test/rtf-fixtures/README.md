# Independent RTF producer fixture

`textutil.rtf` was produced on macOS on 2026-10-22 using the system converter:

```sh
/usr/bin/textutil -convert rtf -output test/rtf-fixtures/textutil.rtf test/rtf-fixtures/source.txt
/usr/bin/textutil -convert txt -stdout test/rtf-fixtures/textutil.rtf
```

The independent converter's text readback matches `source.txt` exactly. The fixture includes a font table, color tables, ignored starred destination, Windows-1252 hex text, Unicode and a surrogate pair, and Cocoa's escaped physical line breaks. Tests consume the committed bytes; they do not require textutil on Windows or Linux. The deliberately adversarial RTF in `../rtf-fixture.cjs` is hand-authored and is not presented as independent producer evidence.
