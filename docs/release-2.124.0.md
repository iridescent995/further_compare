# Release 2.124.0 — FLAC audio integrity

FLAC comparison now verifies the STREAMINFO MD5 against reconstructed signed, little-endian, interleaved PCM samples before accepting an input. Mismatches display an error and preserve the current comparison. A zero digest is treated as unavailable, as required by RFC 9639 section 8.2.

The audio metadata labels distinguish “Audio MD5 verified” from “No audio MD5 stored”. JSON reports include `streamMd5: verified | unavailable`. This verifies decoded audio integrity, not authenticity or independent validation of every frame CRC. Incremental hashing uses a small reusable buffer, and decoder buffer detachment cannot alter the retained digest or original input.

Validation:

- Full unit suite: 1,007 passed, one Windows-only skip.
- Independent Node crypto checks cover incremental MD5, signed PCM widths, channel interleaving, missing/mismatched digests and decoder buffer handling.
- Real browser decoding passes 24 depth/channel/rate combinations, exhaustive 8/16-bit values, dispersed 24-bit values and corrupted MD5 rejection.
- Source desktop checks pass checksum metadata/reporting, WAV equivalence, changed samples, playback, original-byte sessions, restore/swap, rejected input preservation and folder routing.

Both packaged Mac architectures pass the full native FLAC workflow. All three ZIPs pass integrity checks; packaged versions and final renderer/CSS assets match source. Download sizes, SHA-256 and the Windows browser download pass. The shipped branding search is clear. Windows runtime and the remaining full-product scope are still open.
