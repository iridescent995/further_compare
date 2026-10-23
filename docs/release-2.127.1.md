# Release 2.127.1 — Preserve actual folder filename spelling

Fixes exact-path folder comparisons on filesystems that accept alternate case or Unicode spellings. A reproduced Mac fixture with left `Readme.txt` and right `README.txt` produced a paired row with `Readme.txt` displayed and recorded on both sides. The right entry existed under a different spelling; content comparison happened against that alias, while operation snapshots used actual directory names.

The fix rejects implicit aliases when resolving tree endpoints. Exact-path comparisons retain distinct side-only rows for differently spelled names. Users can explicitly align those actual entries to compare or transfer between them. This is a correctness fix to existing exact matching; configurable automatic case and Unicode pairing remains a separate implementation across tree and operation snapshots.

Validation:

- 1,032 unit tests passed, one Windows-only skip.
- Five new tests cover native case and Unicode names, real manual alignment/copy/backup paths, differently cased directory expansion, a platform-independent simulated alias, and a spelling change during metadata reads.
- The new case test fails against the old resolver with the two new spelling guards removed.
- 109 related tree/alignment/projection/operation tests pass.
- Source native workflow passes actual side names, single-click selection, context alignment, double-click opening, both copy directions, NFC/NFD, nested directories and closed-node exclusion. Existing filename matching UI regression passes.
- Both final Mac packages pass the full native workflow, including actual NFC/NFD fixtures and both copy directions.
- All three ZIPs pass integrity checks; versions, changed native tree and final renderer assets match source. Download sizes, SHA-256 checksums and browser Windows download pass. Shipped branding search is clear.

Actual Windows runtime, configurable automatic case/Unicode tree matching, and broader product parity remain open.
