# Independent ZIP preservation fixtures

`produce.py` uses Python 3.14.5 standard-library `zipfile` and the system Info-ZIP 3.0 (Apple build dated August 18, 2026). It imports no application code. Generated files are small, authored test data; no third-party archive payloads are included.

- `python-mixed.zip`: alternating stored/deflated entries, per-entry comments, an archive comment containing a NUL byte, Unix permission bits, fixed DOS timestamps, extended-timestamp extra fields, valid matching Unicode-path extra fields, and a UTF-8 filename.
- `python-streamed.zip`: the same entries written to an explicitly nonseekable buffer. Python emits data descriptors rather than rewriting local headers.
- `python-small-zip64.zip`: each write uses `force_zip64=True`. Local headers contain ZIP64 size fields despite tiny payloads; the central directory need not use ZIP64 sentinel sizes.
- `python-ntfs.zip`: Python-produced entries with standard NTFS extra fields carrying distinct modification, access and creation timestamps. The update test checks DOS/extended Unix/NTFS modification agreement and retains access/creation timestamps.
- `infozip.zip`: actual `/usr/bin/zip` output for fixed-mtime files, including an executable. Its extended timestamp and Unix UID/GID extras are producer output, not application-generated stand-ins. UID/GID values and archive bytes may vary by host on regeneration.

`expected.json` is independent Python readback of retained artifacts. It records whole-archive hashes, uncompressed payload hashes, raw compressed-data hashes, comments, attributes, compression, flags, versions, timestamps and extras. `readback.py` independently reopens an arbitrary output using Python, checks every CRC, and emits the same metadata. Neither script invokes the application's parser or writer.

Tests distinguish unchanged raw compressed payload preservation from rewritten ZIP offsets and size metadata. A ZIP64 rewrite can legitimately update ZIP64 framing; that is not evidence of changed file content. Exact no-op tests require the whole original byte sequence. Post-edit tests require original source buffers to remain unchanged and compare retained metadata and payloads through the independent reader. Malformed controls are explicitly derived byte mutations, not independently authored valid archives.
