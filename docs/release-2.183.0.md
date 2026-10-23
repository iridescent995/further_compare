# Further Compare 2.183.0

Native result exports now use the same guarded file publication as text saves. Binary, spreadsheet, three-way merge, picture, registry and archive Save As outputs verify staged bytes, recheck destination and parent identities, preserve existing permission bits, and publish new files exclusively. A post-save read verifies file identity and exact output bytes before success is reported. Stale comparison owners cancel their export.

The path remains binary-safe with its existing 32 MiB export limit. No text decoding is applied to archives, workbooks, images or binary results. In-place archive writeback/extraction retains its separate mutation workflows.

Validation: 1,898 unit tests passed, one skipped; native fault injection verified concurrent creation/modification, staged-byte substitution, post-publication changes, symlink refusal, fallback publication, permissions, empty output and12 MiB binary output. Independent review verified32 MiB exact bytes. The real workbook/child-archive workflow preserved formulas, styles, comments, hidden sheets, untouched entries and originals.

Both Mac packages passed the export fault-injection workflow. All three archives passed source/branding, ZIP integrity and download verification. Installed app/helper bytes match the verified Apple Silicon package; Finder service registrations remain valid and2.182.0 is retained for rollback. The existing-file final check-to-rename race remains documented in [local save safety](local-text-save-safety.md). Windows runtime testing remains deferred.
