# Further Compare 2.50.0

Archive Compare now opens TAR and gzip-compressed TAR alongside ZIP/JAR. Expand folders to compare their immediate files, select with one click, and double-click to open a child comparison. Reports and saved sessions retain archive inputs and expanded nodes.

USTAR, GNU long names and PAX UTF-8 paths, sizes and timestamps are supported. Archives remain read-only and are never extracted to disk. Input is capped at 32 MiB and expanded content at 64 MiB. Links, sparse files and special entries are explicitly rejected. TAR checksums cover headers; gzip also checks compressed-stream integrity.

Delayed loads and errors from a superseded archive or session are discarded. Independent left and right loads can complete in either order.

Both appearances have a broader palette: cream, mint, coral, gold and orchid in light mode; plum, emerald, rose and amber in dark mode. Comparison highlights remain distinct from navigation accents.

Validation:

- All 455 unit checks passed, including independently generated TAR fixtures.
- Browser checks cover resets, replacement loads, concurrent sides, interrupted restoration and stale errors.
- Packaged Apple Silicon and Intel Mac apps passed TAR.GZ-to-ZIP comparison, selection, double-click opening, reports, session restoration and native appearance checks.
- All three packages passed ZIP integrity and bundled-source verification.
- Download links, file sizes, SHA-256 hashes and an actual Windows ZIP browser download passed.

Windows is cross-built; Windows runtime verification remains pending. Archive writing, additional formats and the broader full-product feature scope remain in progress.
