# Legacy encrypted ZIP compatibility

Assessment: 2026-10-22. The contract below is implemented and released in 2.201.0. Historical feasibility evidence follows.

## Evidence

`node test/archive-zipcrypto-spike.cjs` passes with the pinned zip.js 2.24.0 native codec. Info-ZIP independently produces stored and deflated encrypted fixtures; Python `zipfile` reads the same files and verifies every byte. Both use data descriptors. Correct passwords produce exact content; wrong passwords, late ciphertext corruption, truncated archives and output-limit failures reject. A valid retry succeeds and source bytes remain unchanged. The run emitted 1,048,576 bytes internally across rejected reads, so the production adapter must continue quarantining all chunks until validation succeeds. Log: `/private/tmp/fc-zipcrypto-spike.log`.

The existing `src/archive-aes-reader.js` explicitly rejects legacy encryption before the dependency is invoked. Its metadata-only structural validation view can be extended, but the unmodified encrypted header and payload boundaries must remain authoritative. No new crypto implementation or dependency is needed for this first compatibility path.

## Implementation contract

1. Generalize the encrypted ZIP adapter to distinguish AES and traditional ZipCrypto per entry, including mixed ordinary/AES/legacy entries. Accept supported stored/deflate methods and reject strong/masked-header encryption, conflicting AES extras and inconsistent local/central records. Account for the 12-byte traditional encryption header in stored-size checks. Retain all existing path, overlap, expansion and input bounds.
2. Require complete CRC validation and exact expanded size before returning legacy plaintext. CRC detects accidental errors; it does not authenticate the archive. Keep AES authentication mandatory. Preserve both input bytes and rejected plaintext quarantine, with timeout/abort worker termination.
3. Handle password-check false accepts explicitly. A legacy header checks only one byte; a wrong password may fail later as CRC or decompression failure. Do not turn every I/O, abort, limit or worker failure into an automatic password retry. Offer an explicit retry for ambiguous password-or-corruption failures without publishing content or losing the previous comparison.
4. Expose accurate encryption metadata through the worker and password UI. State that legacy entry contents lack cryptographic authentication; archive names and sizes are also unauthenticated. Retain runtime-only credentials, ciphertext-only parent sessions, explicit plaintext export disclosure, and read-only encrypted-parent operations. This is input compatibility; encrypted writing remains separate scope.
5. Exercise current compact archive workflow: opening, lazy node comparison, password cancellation/retry, selected child comparison, text-only document children, extraction, sessions and reset while reads are pending. Failed candidates must leave the previous source and edits intact.

## Required acceptance beyond the experiment

- Independent producer fixtures both with and without descriptors; stored/deflated, zero-length, mixed entries, independent passwords, Unicode filename and qualified password encoding behavior.
- Deterministically selected wrong passwords that pass the one-byte header check, followed by CRC/inflater failure. No success from header validation alone.
- Local/central metadata contradictions, ciphertext/header corruption, unsafe paths, overlaps, dishonest sizes, output caps and cancellation. Preserve all AES acceptance cases unchanged.
- Real browser worker/UI and source/native workflows; both final Mac packages, source/ZIP integrity and installed startup checks. Windows runtime remains deferred by the user.

## Primary references

- [zip.js password candidate behavior](https://gildas-lormeau.github.io/zip.js/api/interfaces/PasswordCandidatesOptions.html) describes the one-byte legacy password check and full-content CRC requirement. Current documentation is guidance; implementation decisions must also inspect the pinned 2.24.0 source.
- [zip.js entry validation options](https://gildas-lormeau.github.io/zip.js/api/interfaces/EntryGetDataCheckPasswordOptions.html).
- Pinned `node_modules/@zip.js/zip.js/lib/core/zip-reader.js` selects descriptor-time versus CRC password verification and CRC checking for legacy entries; the experiment uses its native codec build.


## Implemented input behavior

The encrypted reader now distinguishes AES and legacy ZipCrypto per entry. Traditional stored and deflated entries retain structural/path/size limits and a private plaintext quarantine. All legacy bytes must pass CRC and exact-size validation before publication. AES authentication remains mandatory. CRC is not authentication: an empty stored legacy entry can accept a wrong password that happens to pass the one-byte header check, because there is no nonempty content to validate.

Legacy passwords are encoded as UTF-8 bytes explicitly. ASCII Info-ZIP and Unicode independently generated fixtures are covered; locale-specific legacy password encodings are not inferred or retried. The prompt explains the lack of authentication. Header-check failures offer password retry; CRC/decompression failures offer an explicit password-or-damage retry with cancellation. Limits, cancellation, worker failures and deadlines do not trigger password retries.

The existing encrypted archive workflows remain read-only, with runtime-only passwords, ciphertext-only parent sessions, explicit decrypted export/child disclosure and unchanged source bytes. Encrypted writing remains pending. Independent fixtures cover descriptor and non-descriptor entries, empty entries, Unicode paths/passwords, independently passworded entries and deterministic wrong passwords that pass the header check.

## Release 2.201 acceptance

All 2,260 unit tests passed (one skipped). Independent producer/decoder, real Chrome worker/UI, source desktop and both final Mac packaged workflows passed. Packaged checks cover password ambiguity/retry, exact export hashes, paired comparison, child disclosure, ciphertext sessions, read-only actions and unchanged originals. Mac signatures, source/worker assets, ZIP integrity, browser downloads, installed startup and Finder Services passed. Windows execution remains deferred; Windows ZIP integrity passed. The previous 2.200 Mac installation remains available for rollback.
