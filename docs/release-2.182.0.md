# Further Compare 2.182.0

Local text saves now recheck destination contents, file identity and parent locations after staging. A file created or modified during that interval is preserved and the editor draft remains available. The staged bytes are verified against the intended output and flushed before publication.

New destinations use exclusive publication. When hard links are unsupported, a native exclusive regular-file rename provides a fallback; it never falls back to an overwriting rename or partial copy. Existing permissions are retained, and cleanup checks temporary-file identity.

Existing-file overwrites still have a narrow final validation-to-rename race; this is not a universal compare-and-swap guarantee. Actual FAT/exFAT media and Windows runtime testing have not been exercised. See [local save guarantees and limits](local-text-save-safety.md).

Verification: 1,898 unit tests passed, one skipped. Both Mac packages passed the native save workflow with fault injection, real native fallback, permission checks and Finder-helper regressions. All three archives passed source, branding, ZIP integrity and download checks. Installed2.182.0 app and helper bytes match the verified Apple Silicon package; Finder Services remain valid and2.181.0 is retained for rollback.
