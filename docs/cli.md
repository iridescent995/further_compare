# Command-line comparison

Run with Node.js 24 or later from the project directory after installing dependencies with `npm ci`:

```sh
node scripts/compare.cjs --left ./before.txt --right ./after.txt --type text --format text
node scripts/compare.cjs --left ./left-folder --right ./right-folder --type folder --format json --output ./report.json
node scripts/compare.cjs --left ./left.bin --right ./right.bin --type binary --format html --output ./report.html
node scripts/compare.cjs --left ./left.csv --right ./right.csv --type table --format json
```

`--left` and `--right` are required. `--type` defaults to `text`; supported types are `text`, `folder`, `binary`, and `table`. `--format` defaults to `text`; supported formats are `text`, `json`, and `html`. Text inputs use the same decoder as the editor: Auto detects UTF-8, UTF-16LE/BE and UTF-32LE/BE BOMs, and assumes UTF-8 without a BOM. Use `--left-encoding` and `--right-encoding` for BOMless or legacy files. Accepted values are `auto`, `utf8`, `utf16le`, `utf16be`, `utf32le`, `utf32be`, `windows1250`, `windows1251`, `windows1252`, `windows1253`, `windows1254`, `windows1255`, `windows1256`, `windows1257`, `windows1258`, `latin1`, `shift-jis`, `euc-jp`, `gb18030`, `big5`, and `euc-kr`. East Asian encodings require explicit selection. Valid alternate byte mappings are readable. Original bytes are preserved for unchanged text; saving edits with alternate mappings requires explicit normalization consent or conversion to Unicode in the editor. Output rejects characters that cannot be represented without substitution. Conflicting BOMs, malformed sequences and null characters are rejected. JSON text reports include `sourceFormats` for both sides. Encoding options apply only to text comparisons. Table inputs must be UTF-8. Tables use comma delimiters for CSV and tab delimiters for `.tsv` inputs; rows are compared in order.

Text comparisons accept `--ignore-case` and `--ignore-whitespace`, individually or together. Rules affect equality and the exit code while report rows retain the original text. JSON reports include `comparisonRules` and `ignoredLineCount`; text/HTML reports label rule-equivalent results accordingly. Case uses locale-independent lowercase conversion, not full Unicode case folding. These flags are rejected for folder, binary and table modes.

Without `--output`, the report goes to standard output. An explicit output creates a new file; existing files are never overwritten. HTML reports escape all compared content and do not execute scripts from inputs. Reports may contain source text and relative filenames, so choose the destination appropriately.

Exit codes:

- `0`: inputs compare equal.
- `1`: differences found; the report was generated successfully.
- `2`: invalid arguments, read errors, limits, or report-write errors.

Text inputs are limited to 10 MB, matching the editor. Binary and table inputs are limited to 32 MB. Folder comparison includes regular files and directories, rejects symbolic links and special files, and checks for changes while reading. It supports up to 50,000 entries and 1 GB of total file contents. It does not create backup directories or modify input files. Folder results compare file contents with SHA-256 and include relative paths, sizes, and statuses. Directory equality describes the directory entry; child rows report individual differences.

# Folder snapshots

In the desktop app, use **File → Save Left Folder Snapshot** or **Save Right Folder Snapshot** after selecting a folder. Save to a new `.fcsnapshot` file outside the folder being captured. The snapshot records relative paths, entry kinds, sizes, modification times, and SHA-256 content hashes. It does not store file contents or a live root path.

Use **File → Compare Folder Snapshots** and choose exactly two snapshots to compare stored states without accessing the original folders. Snapshot comparison cannot authorize copying, deleting, or changing live files. Snapshot JSON is versioned and bounded to 25 MB. The same folder entry/content limits and symlink rules apply when capturing snapshots.

# Batch comparison scripts

Run a versioned JSON batch with Node.js 24. Paths are relative to the batch file, not the terminal's current directory:

```json
{
  "version": 1,
  "jobs": [
    {"left": "before.txt", "right": "after.txt", "type": "text", "ignoreCase": true, "output": "text-report.json"},
    {"left": "before", "right": "after", "type": "folder", "format": "html", "output": "folder-report.html"}
  ]
}
```

```sh
node scripts/batch.cjs --script ./comparison-batch.json --dry-run
node scripts/batch.cjs --script ./comparison-batch.json
```

`left`, `right` and `output` are required per job. Types and text rules match the single-comparison CLI above. The defaults are `type: "text"` and `format: "json"`. Batches accept 1–100 jobs and a script up to 1 MiB. Unknown fields, duplicate destinations, symlink input endpoints, existing output files and reports inside any compared folder are rejected. Output parent directories must already exist.

Dry run validates the complete plan, checks input types and report destinations, and prints the resolved jobs without comparing content or writing reports. It does not prove that file contents can be decoded or that inputs will remain unchanged. Execution uses the existing comparison engines and exclusive report creation; input files are not modified.

Standard output is a JSON summary with each job's `planned`, `same`, `different` or `error` status. Preflight failure prevents all report writes. A comparison-time failure is recorded and later jobs still run; successful reports remain available. This is not an all-or-nothing transaction, and reports already written are not removed. Exit codes are 0 for a successful dry run or all equal inputs, 1 for differences, and 2 for any error.

Version 2.53.0 exposes **File → Batch Comparisons…**: choose a JSON script, review the resolved jobs without writes, then run after native confirmation. Changed plans require a fresh review. The workflow is included in the desktop downloads; both Mac packages were tested, while Windows runtime verification remains pending. It runs comparisons and report exports, not arbitrary shell commands or file synchronization.

Text batch jobs accept optional `leftEncoding` and `rightEncoding` fields using the encoding names above; both default to `auto`. The desktop review and dry-run output show these choices. Non-text jobs reject encoding fields. Changing an encoding after desktop review requires reviewing the batch again.

# Document text comparisons — 2.195.0

These additions shipped in 2.195.0. Native document-batch, existing batch and PDF acceptance passed on both Mac packages, and 2.195.0 is installed. Standalone Node CLI acceptance used the repository installation on this Mac; it is not a claim that packaged desktop apps distribute the Node canvas backend. Windows package integrity passed; Windows runtime testing remains deferred.

Text mode recognizes `.docx` and `.pdf` inputs on either side, including comparisons against ordinary text. DOCX compares main-document paragraphs and tables; PDF compares extracted page text. Binary, table and folder modes keep their existing byte, delimited-data and snapshot semantics. These conversions do not provide OCR, visual PDF comparison, page-layout equality, or support for other Office formats.

```sh
node scripts/compare.cjs --left ./before.pdf --right ./after.pdf --format json
node scripts/compare.cjs --left ./document.docx --right ./expected.txt --format html --output ./document-report.html
```

Recognized documents allow up to 32 MiB of input; ordinary text retains its 10 MiB limit. A document side requires `auto` encoding. Explicit non-auto encoding is rejected, including during batch preview. Text rules and profiles run after extraction and preserve the extracted rows in the report. Failed conversion produces an error, never an empty successful result or a binary fallback.

Plain Node PDF extraction lazily launches a fixed child process using PDF.js 6.2.108's legacy entry and its genuine optional canvas dependency. Use Node 24 with the normal repository `npm ci` installation, including optional dependencies. Missing or unusable PDF dependencies produce `DOCUMENT_ENGINE_UNAVAILABLE` only when PDF conversion is requested; ordinary text and DOCX still work. The desktop batch path uses its existing sandboxed renderer adapter and does not require the Node canvas addon. Node PDF runtime acceptance currently covers macOS ARM64; other platforms, including Windows, are not claimed tested.

PDF extraction caps input at 32 MiB, pages at 1,000, text items at 1,000,000 and UTF-8 output at 8 MiB. The Node parent enforces a 30-second deadline including child startup, kills aborted/timed-out work and waits for child exit. Resources come from the installed package, with no network fallback. One extraction may run per Node process; concurrent adapter calls reject explicitly. This child boundary is terminable but is not an OS sandbox or strict memory ceiling.

Version 1 reports add optional `documentProjections`, `comparisonMeaning: "extracted-text"` and `inputIdentities` (captured byte lengths and SHA-256 hashes). `sourceFormats` describes the compared text, not a PDF/DOCX binary encoding. Equal projections mean equivalent extracted text under the requested rules, not identical bytes or layout. Text/HTML reports show coverage and exclusions explicitly. HTML continues to escape extracted content.

Inputs are read into bounded snapshots and revalidated before report publication. Output directory identities are captured before conversion and checked again during publication. New reports use exclusive creation; successful publication verifies exact bytes and the destination's identity against the still-open descriptor. A failed write removes only a still-owned, unchanged partial report; a replaced or modified destination is preserved. No document source writeback or document export is granted by these commands.

Batch preview adds `documentConversions` descriptors without extracting documents or starting a PDF child. Conversion errors normally allow later jobs to run. Cancellation stops later scheduling, retains successful earlier reports and records `cancelled` jobs with `attempted: true` for interrupted work or `false` for unattempted work. SIGINT/SIGTERM exit with code 2 after cancellation cleanup. Desktop batch has a Stop action and owner-window cancellation; changed plans require review again, including after confirmation.

PDF adapter errors use `DOCUMENT_ENGINE_UNAVAILABLE`, `DOCUMENT_PASSWORD_REQUIRED`, `DOCUMENT_NO_TEXT`, `DOCUMENT_INVALID`, `DOCUMENT_LIMIT`, `DOCUMENT_RESOURCE`, `DOCUMENT_TIMEOUT` and `DOCUMENT_CANCELLED`. Existing filesystem error codes remain intact. Exit codes remain 0/1/2, and executable batch output remains one JSON summary.

Source acceptance: 40 CLI/batch tests passed in `/private/tmp/fc-document-cli-final.log`, including genuine PDF/DOCX combinations, report formats, missing-engine fallback for ordinary modes, subprocess signals, source mutation and destination races. The subsequent 2.195.0 release acceptance is recorded below.

Source verification update: the CLI symlink boundary was restored without changing desktop picker behavior. Both initial symlink endpoints and endpoints replaced by symlinks during conversion are rejected. The combined snapshot/CLI/batch run passed **43/43**, terminal 0, `/private/tmp/fc-cli-symlink-final.log`. Native source acceptance also passed terminal 0: `/private/tmp/fc-document-batch-final-source.log` (real PDF/DOCX adapters, preview without extraction, malformed-input continuation, Stop, retained reports and unchanged originals) and `/private/tmp/fc-batch-final-source.log` (existing batch workflow). The 2.195.0 package acceptance below supplements these source checks.

Release acceptance (2.195.0): full source suite passed 2,166 tests with one skip and no failures. All six Mac ARM64/Intel runs passed: document batch, existing batch and PDF workflows. The Intel harness initially used an insufficient five-second readiness timeout; its test-only timeout was raised to 60 seconds and the final run passed. Package source/dependency audits, signatures, ZIP contents and downloads passed. The release was installed with the prior 2.194.0 app backed up, and Finder/Services integration remained healthy. Standalone Node CLI verification is repository-based on this Mac; Windows runtime testing remains deferred. Installed startup smoke also passed terminal 0 (`/private/tmp/fc-2.195-installed-smoke.log`): desktop bridge available, Node isolation enabled and sample comparison produced two changes.
