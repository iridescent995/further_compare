# TAR archive comparison — development validation

The shared archive reader accepts USTAR, GNU TAR and PAX TAR, including gzip-compressed TAR. Archives stay in memory; browsing does not extract files to disk. Paired files are compared only when their parent node is loaded. ZIP and TAR can be compared against one another.

The reader supports long names, UTF-8 PAX paths, PAX size and timestamp overrides, GNU binary numeric fields, implicit directories and conventional `./` roots. Input is limited to 32 MiB and expanded content to 64 MiB. Links, sparse files and special entries are explicitly rejected. TAR header checksums do not verify file content; gzip integrity checks apply to compressed streams.

Validation completed on the development build:

- `node --test test/tar.test.cjs test/archive.test.cjs`: 12 passing checks, using Python standard-library archive writers as independent fixtures.
- `FC_ARCHIVE_TAR=1 node test/archive-desktop.cjs`: TAR.GZ against ZIP; node expansion, selection, double-click text comparison, report output and saved-session restoration passed in Electron on macOS.
- `node test/archive-desktop.cjs`: existing ZIP workflow passed.
- `npm run build`: passed.
- `npm test`: all 455 checks passed.
- `node test/archive-races-browser.cjs`: reset during decompression, newer same-side request, independent sides, interrupted session restoration and stale decode errors passed. Current-file errors remain visible and preserve the prior successful input.

Fixed during validation: PAX filenames must take precedence without decoding overridden legacy filename bytes; an empty local PAX header still requires a subsequent archive entry.

Packaged Apple Silicon and Intel Mac archive workflows and appearance checks passed for 2.50.0. All three download archives passed integrity/source checks, and website download verification passed. Windows runtime checks remain pending. Archive writing is outside this implemented read-only feature.

The desktop CI workflow now declares Python for independent TAR fixtures and runs TAR.GZ-to-ZIP session workflows on its Mac and Windows matrix. This configuration has not yet been executed remotely.
