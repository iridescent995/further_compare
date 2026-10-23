# Further Compare 2.204.0

This release adds explicit CP437, CP850, ISO-8859-15, KOI8-R and modern MacRoman input/output profiles. Saving rejects unrepresentable text before replacing a destination; edit, undo/redo and saved-session workflows retain the chosen encoding.

XLSX, XLS and XLSB date-formatted numeric caches now share a projection that preserves historical calendar semantics and distinguishes submillisecond values. The 1900 zero day and fictional leap day are explicitly labelled. Unrelated workbook edits preserve original date serials, formulas and styles. Negative/out-of-range numeric dates remain unsupported; arbitrary nonnumeric XLSX worksheet part filenames remain a parser limitation.

The Explorer setup interface now connects reviewed operations to the lifecycle service with expiring one-use, window-bound tokens. Production native authority is still absent: modern Explorer activation remains unavailable pending signed Windows components and runtime acceptance. This release does not claim Windows execution testing, which the user deferred.

Validation includes 2,370 passing unit tests (one skipped), browser encoding/date/workbook regressions, production builds and exact packaged source/dependency verification. Release runtime and installation results are recorded in implementation-plan.json.

Packages use the existing local Electron 42.11.16 archives. Mac packages have coherent ad-hoc signatures and the universal Finder extension; public signing/notarization remains pending.

Both Mac architectures passed packaged codec, workbook and shell acceptance. All three ZIPs and download hashes passed. Version 2.204.0 is installed locally; installed smoke and asset audits passed, Finder Services remain healthy, and 2.203.0 is retained as the rollback app.
