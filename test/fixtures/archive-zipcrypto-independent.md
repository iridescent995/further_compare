# Traditional encrypted ZIP fixtures

These are public test passwords and synthetic content. None of the files contain user data.

`archive-zipcrypto-independent.json` contains 11 archives and 14 entries:

- Stored and deflated entries, each with and without descriptors, including empty files.
- A mixed archive with ordinary content, independently passworded entries, and a Unicode filename.
- Two archives produced by Info-ZIP 3.0, independently decoded by Python `zipfile`.

Regenerate using `python3 test/archive-zipcrypto-fixtures.py`. The custom fixture-only writer uses Python `struct` and `zlib`; it does not import the application's reader or zip.js. Deterministic encryption headers make the synthetic records reproducible and must never be used as a production encryption technique. Info-ZIP's random headers and filesystem timestamps mean those two archive byte hashes change when regenerated.

The nonempty synthetic entries also contain `wrongHeaderPassword`: a deterministic wrong password whose decrypted twelfth header byte matches. Python's decoder rejects the resulting payload after header acceptance with CRC or decompression failure. `node --test test/archive-zipcrypto-producer.test.cjs` independently revalidates the committed fixture bytes, correct reads, header false accepts, and late failures without regenerating fixtures.

`archive-encryption-mixed-independent.json` combines the four entries of the mixed legacy archive with the existing independently produced pyzipper AES fixture. The generator `test/archive-encryption-mixed-fixture.py` copies the original local records and ciphertext, adjusts central offsets, and writes a new end record. It requires pyzipper 0.3.6 and independently reads all five entries back. Its `encryptionType` metadata distinguishes `aes`, `zipcrypto`, and ordinary entries. Example with the existing isolated fixture dependency:

```sh
PYTHONPATH=/private/tmp/fc-aes-spike/python python3 test/archive-encryption-mixed-fixture.py
```

Passwords with Unicode are encoded as UTF-8 bytes. This verifies an explicit encoding contract; it does not establish interoperability with historical producer-specific locale encodings. Traditional encryption has no authentication: CRC and length validation detect errors but do not prove password correctness or integrity against manipulation. In particular, a stored empty entry cannot reject a wrong password that passes its one-byte header check because it has no encrypted payload and its CRC is zero.

`node test/archive-zipcrypto-worker-browser.cjs` exercises the actual browser Worker boundary: all 12 archives, exact bytes for all 19 entries, 10 wrong-password header false accepts with no returned content, explicit encryption metadata, corrupted ciphertext, pending password and queued-read cancellation, and a valid fresh-reader retry. It runs directly against source bundles and requires Chrome.
