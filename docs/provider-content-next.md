# Provider content comparison implementation boundary

Update: provider reader/comparison extraction is now implemented and source-tested. The notes below describe the preserved design requirements. Concrete SFTP readers and tree/session cancellation wiring remain pending.

Current source inspection: `desktop/folders.cjs` still owns local content I/O. `compareFilePairs` uses local safe paths and stat; `compareRows` uses local handles and hashes. The new listing metadata interface is insufficient for content comparison by itself.

Implement a handle-scoped reader with metadata, bounded chunk reads, current-path validation and guaranteed close. Local implementation must retain O_NOFOLLOW, before/after handle observations and final path observations. Keep the existing inspectFile helper for transfer/snapshot workflows until those migrate separately. Remote adapters must expose actual guarantees and timestamp precision; do not manufacture local inode/ctime or nanosecond evidence.

Extract the comparison policy separately: always hash raw bytes; buffer text only through the existing 10 MiB normalization ceiling. Preserve decoder and control-character fallback, side-specific encodings, all whitespace/case/blank/ignored-pattern rules, and validation after asynchronous pattern workers. Metadata-only matches must keep distinct provenance. Add exact local mtimeNs metadata before migrating time-tolerance calculations.

Cache keys must include endpoint authority, relative path, revision evidence and normalization options. Retain the current 2048-entry bound. Disable persistent content-cache reuse for weak remote revision evidence. Cache hits and zero-size/size-mismatch shortcuts still need endpoint revalidation.

Current comparison concurrency is four workers without cancellation. Add cancellation to scheduling, chunk reads and normalization; on failure, abort siblings and await handle cleanup before returning. Never cache a partial hash. Raw local hashing currently has no whole-file size ceiling, so preserve streaming instead of accidentally applying the text-buffer ceiling to binary comparison.

Required regression families: aligned files, selected compare, provider boundary, rules, text rules/encoding, time, Unix metadata, filename criteria and ignored-text native invariants. Add short-read, growth/truncation, replacement, cancellation, weak-stamp and mutation-during-normalization fixtures.
