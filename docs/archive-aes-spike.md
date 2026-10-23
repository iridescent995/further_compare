# Encrypted ZIP read-only interoperability spike

2026-10-22. Investigation only: no production dependencies, archive code, build or release files changed. All dependencies and generated encrypted fixtures are under `/private/tmp/fc-aes-spike`; repository additions are the opt-in spike and independent fixture generator.

## Pinned artifacts

- Published `@zip.js/zip.js` **2.24.0**, BSD-3-Clause. Tarball SHA-256: `37fe939b7eaf1edc0291fd11c9de5b0814f91b259951489f95ed6f18f5c2db46`. Downloaded tarball SHA-512 matches registry integrity `sha512-WlaVKzdqBK+RF3bdiXZWbdCnvGB6PdO4IHC1mn/2Yfl3bASgqUNegnU3+PNg61iecwoPfUi5BgLUPqBukXpyWw==`.
- Independent generator `pyzipper` **0.3.6**, MIT; wheel SHA-256 `6d097f465bfa47796b1494e12ea65d1478107d38e13bc56f6e58eedc4f6c1a87`.
- Generator crypto backend `pycryptodomex` **3.24.1**, BSD/Public Domain; downloaded universal2 macOS wheel SHA-256 `9bb353c764c144a9fc03302ef3763ad0c3e75bc7ca41f445cc98455f36da6c59`.

Registry metadata and licenses were inspected. Public npm metadata/tarball were fetched with system TLS verification after the configured corporate npm proxy failed to resolve. No persistent proxy settings changed. Python wheels were unpacked only into the temporary directory.

## Results

`test/archive-aes-spike-fixtures.py` generated and independently reread twelve fixtures using pyzipper: AE-1 and AE-2 × AES-128/192/256 × stored/deflated. They contain known Unicode text and use a Unicode test password. Fixture SHA-256 and expected content hashes are recorded in temporary `fixtures.json`. Two further 4 MiB fixtures exercise compressed output bounds and streaming authentication behavior.

`test/archive-aes-spike.cjs` completed **21 checks**, terminal exit 0. Log: `/private/tmp/fc-aes-spike-result.log`.

- All twelve independently generated variants decoded to exact expected bytes.
- Wrong password, modified ciphertext, modified authentication tag, truncated archive, and AE-1 local/central CRC tampering failed.
- A bounded WritableStream rejected expansion past 64 KiB on a 4 MiB entry.
- Midstream AbortSignal cancellation rejected; a subsequent extraction succeeded.
- **Critical integration observation:** a 4 MiB stored entry with a corrupted final authentication tag delivered **3,932,160 plaintext bytes to the sink before rejecting**. The adapter must quarantine all bytes until authentication completes. Never stream tentative plaintext into a comparison, filesystem output, child session or persistent cache.

The spike explicitly sets authentication and CRC checks and strict/overlap checks. It uses zip.js in-process Node mode, not a production terminable worker. Bounds here prove the supplied streaming sink's rejection, not an OS memory ceiling or watchdog. No Windows or browser packaging acceptance is claimed.

## Integration decision

Proceed with a separate bounded async encrypted ZIP reader exposing the existing entries/list/read interface. Preserve ciphertext in saved parent inputs and return plaintext only after full successful entry validation. Passwords/unlock handles belong exclusively to runtime state. Decrypted child session/workspace persistence requires an explicit disclosure policy. First integration can be read-only comparison/child viewing; encrypted writeback/export remains separate.

Retain current 32 MiB input, 64 MiB aggregate expanded and 50,000-entry limits. Validate actual stream length, metadata/name/type conflicts, local/central AES extra-field agreement and entry boundaries independently. Add hard cancellation/deadlines in a worker before production. Mixed/plain entries, per-entry passwords, ZIP64 with AES, malicious metadata, verifier collisions, independent additional producers, and bundled browser/native workflows are still acceptance work. These are not supported-format claims from this spike.

AES entry authentication does not authenticate the entire archive or its filenames/metadata. ZipCrypto, PKWARE strong encryption, encrypted central directories, split archives, extra compression methods and other formats are not established by these tests.

## Reproduce

Fetch the exact npm tarball and Python wheels above into an isolated directory; verify hashes and unpack as `package/` and `python/`. Then run:

```sh
FC_AES_SPIKE_ROOT=/private/tmp/fc-aes-spike PYTHONPATH=/private/tmp/fc-aes-spike/python python3 test/archive-aes-spike-fixtures.py
FC_AES_SPIKE_ROOT=/private/tmp/fc-aes-spike node test/archive-aes-spike.cjs
```

Sources: [published package metadata](https://registry.npmjs.org/@zip.js%2fzip.js/2.24.0), [zip.js license](https://github.com/gildas-lormeau/zip.js/blob/master/LICENSE), [entry extraction options](https://gildas-lormeau.github.io/zip.js/api/interfaces/EntryGetDataOptions.html), [WinZip AE-1/AE-2 specification](https://www.winzip.com/en/support/aes-encryption/).
