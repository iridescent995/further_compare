# Local result save publication

Local text Save As and native comparison-result exports prepare encoded bytes before touching the chosen destination. It stages a sibling file exclusively, preserves existing POSIX permission bits, and flushes the staged file before publication. A bounded, snapshot-validated read verifies its exact bytes against the intended output before it can replace anything. The generic export path accepts binary data up to32 MiB and verifies the published file identity and exact bytes before reporting success.

Before publication, the app checks that the destination parent and its ancestors retain their identities. For an existing regular file, it also rechecks the captured file identity and revision. Symbolic-link destinations and nonregular files are rejected. If the destination was absent, an exclusive hard-link publication prevents replacing a file created concurrently. When hard links are unsupported, the native helper performs an identity-checked exclusive regular-file rename. It never falls back to an overwriting rename or partial copy. Unsupported native exclusivity fails without overwriting a destination.

Failed staging or validation preserves the current destination and editor draft. Temporary cleanup removes only the staged file with the expected identity. A successful save verifies that the published file is the staged file before updating the editor's path and source format.

Actual external FAT/exFAT media are not available for runtime verification; simulated unsupported-link failures exercise the real native fallback.

Existing-file replacement uses a validated rename. There remains a narrow race between the final destination check and the rename: portable filesystem APIs do not provide a compare-and-swap replacement conditioned on another file's revision. These checks detect changes during staging; they do not claim universal protection against adversarial simultaneous replacement. This workflow does not provide backup/recovery history for an explicitly confirmed overwrite.

Windows package checks are separate from actual Windows filesystem testing, which remains deferred at the user's request.

The shared export handler covers binary, table/workbook, three-way text merge, picture and registry results, along with archive downloads/exports that use the native Save As dialog. Archive in-place writeback and extraction retain their separate reviewed mutation workflows.
