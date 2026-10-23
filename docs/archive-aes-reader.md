# AES ZIP reader integration

Shipped and installed in Further Compare 2.197.0 after browser, native desktop and packaged Mac acceptance.

`src/archive-aes-reader.js` uses pinned `@zip.js/zip.js` 2.24.0 through its native browser entry. It validates a copied source snapshot, checks original central/local AES metadata consistency and reuses the ordinary ZIP structural validator on a private metadata-only copy. The reader supports WinZip AES AE-1/AE-2 at 128/192/256 bits with stored or deflated contents, and ordinary entries within the same archive. It refuses unsupported encryption rather than guessing.

Every entry is extracted into private bounded chunks. Authentication, applicable CRC, actual size and cancellation must all succeed before bytes are returned. Failed chunks are cleared; no tentative plaintext is published. Caller-visible metadata cannot redirect authoritative reads. Inputs stay bounded at 32 MiB, expanded totals at 64 MiB and directory inventories at 50,000 entries. These are application limits, not an OS memory sandbox.

`src/archive-aes-worker-client.js` and `archive-aes-worker.js` provide a dedicated terminable worker per reader, a 30-second extraction deadline, at most four simultaneous readers and 32 queued reads per reader. Reads are serialized. A wrong password can be retried; deadline, disposal or cancellation closes the worker and requires reopening. Closing while a password callback is pending also rejects the read. Passwords are runtime request data and never written to settings or sessions by this layer. Native ZIP-library workers and external resource fetching are unnecessary.

Checked-in independent pyzipper fixtures cover all twelve AES/version/compression combinations, mixed entries with distinct passwords, corrupt ciphertext/authentication tags, CRC changes and false expanded sizes. Reader unit tests and real-browser worker tests exercise rejection without returned plaintext, retries, snapshot/metadata isolation, hard timeout/abort, pending password disposal and worker-count recovery.

Application behavior:

- AES inputs route to the local worker with cancellable per-entry password prompts. Incorrect passwords can be retried; authentication corruption is reported without an endless password retry.
- Parent sessions retain ciphertext. Readers and runtime-only credential caches are disposed on tab/source reset. Cancelling a candidate unlock preserves the previously opened side.
- Opening a decrypted child explicitly discloses unencrypted session/workspace/report/file persistence. Cancelling creates no child; approved children have no encrypted-archive writeback link.
- Saving or extracting decrypted files requires an explicit plaintext export confirmation. Originals remain unchanged.
- Encrypted comparisons disable archive editing, copying between archives, rebuilding and edit history. Encryption writeback is not implemented.
- Restored metadata can remain visible with pending comparison status after an unlock is cancelled; no unverified equal result is reported.

Desktop workflow, local workers in both Mac packages, package integrity and installed startup passed. Windows runtime testing remains deferred.

Entry authentication does not authenticate all ZIP filenames or metadata. Encrypted output, other archive formats and full archive parity are not claimed. Legacy ZipCrypto input was added in source after 2.200; see [implementation contract and limits](archive-zipcrypto-plan.md). Historical release evidence below describes AES support.

Acceptance on this Mac: six core tests (including twelve independent AES variants), ten browser-worker scenarios, and the full suite of 2,185 passing tests with one skip. Final browser worker log: `/private/tmp/fc-aes-worker-acceptance.log`; full suite: `/private/tmp/fc-aes-foundation-full-units.log`; coordinated build: `/private/tmp/fc-aes-foundation-build.log`. These checks precede any archive-screen or packaged application integration.

Final source acceptance after cleanup and Explorer composition corrections: all twelve independent AES variants also passed through the real browser worker, alongside ten lifecycle/failure scenarios (`/private/tmp/fc-aes-worker-all-variants.log`). The final full suite passed 2,187 tests, skipped one and failed none (`/private/tmp/fc-aes-foundation-final-units.log`). No new installed release or archive UI support is implied.

## Release 2.197 acceptance

The final ARM64 and Intel packages passed actual password cancel/retry, authenticated export, paired comparison, child consent cancel/approve, read-only controls, ciphertext-only saved parent sessions, immutable original files and version checks. Pastel dialog screenshots were inspected. Ordinary archive entry editing and PDF archive regressions passed. The full unit suite passed 2,187 tests with one skip. Package signatures, exact source/worker bytes, dependency license, ZIP integrity, downloads and installed startup passed; Finder Services remained healthy.

Logs: `/private/tmp/fc-2.197-aes-arm64.log`, `/private/tmp/fc-2.197-aes-x64.log`, `/private/tmp/fc-2.197-aes-assets.log`, `/private/tmp/fc-2.197-installed-smoke.log`. The installed rollback copy is `/Users/harshit/Applications/.Further Compare.previous-2.196.app`.
