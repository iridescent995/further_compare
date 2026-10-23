# XLS cached-value admission boundary

`src/xls-preflight.cjs` exports synchronous, browser-compatible `preflightXls(Uint8Array)` and frozen `XLS_PREFLIGHT_LIMITS`. It does not execute formulas, macros or links and has no third-party dependency.

## Container and BIFF profile

- CFB major 3 / 512-byte and major 4 / 4096-byte sectors, 64-byte mini sectors, little endian, 4096-byte mini cutoff.
- Entire input at most 32 MiB. FAT/DIFAT table counts may not exceed those needed to address the file (redundantly oversized tables are rejected). FAT/DIFAT chains, self markers, complete allocation ownership, stream sector counts, mini FAT chains and mini-stream allocation are checked. Cycles, overlapping owners, unreachable allocation, trailing allocated FAT entries, invalid directory names and ambiguous workbook streams fail before reader invocation. Directory entries are capped at 4096 and traversed iteratively with unique ownership and sibling-name checks.
- Canonical root `Workbook` stream containing BIFF8 globals plus declared worksheet substreams only. Encryption, older BIFF, chart/macro/dialog substreams and RString rich inline labels are not supported. BIFF8 inline Label and shared-string values are supported.
- At most 64 sheets, 500,000 BIFF records, 8,224 payload bytes per record; worksheet extents at most 50,000 rows and 256 columns. Both populated cell count and sum of rectangular projected cell counts are capped at 500,000. Duplicate cell coordinates fail. Declared dimensions are bounded too.
- Cell XF indices and custom number-format references are validated; XF and FORMAT counts are each capped at 4096. Custom format IDs must be unique and at least 164, avoiding builtin overrides. Shared-string counts and indexes, rich/extended payload bounds, encoding changes at CONTINUE boundaries, per-string 32,767 UTF-16 code units and aggregate 8 Mi code units are checked. Repeated strings count against a separate 10 Mi code-unit projected value budget. Formula string caches have bounded continuation decoding. Unknown metadata records are structurally bounded but not semantically validated or passed to the reader.

## Reader isolation

The return object includes `rawWorkbook`: a **derived BIFF cached-value stream**, not the original XLS container. It contains only validated BOF/EOF, sheet declarations, date/codepage, number format/XF, dimensions, cell and shared-string records. Workbook sheet offsets are rebuilt. Formula records retain cached result bytes, with token payloads removed and shared-formula flags cleared; drawing, object, link, defined-name and other metadata records are omitted.

This derivation is necessary because the qualified SheetJS reader parses formula token and extra-array structures even with `cellFormula:false`. It also keeps unrelated CFB property/macro streams away from that reader. It is not a source-preserving conversion or an implementation of formula semantics. The application must retain original bytes separately for sessions/source protection and never export the derived stream as a user's XLS.

Metadata includes date1904; sheet names/order/visibility/extents; `coordinates` with formatting-blank flags; and a formula census with cached type. Numeric, boolean, error and string caches are available; the BIFF explicit empty-string result remains a string. Missing STRING follow-up or unrecognized/nonfinite formula cache is marked `unavailable` and uses an internal zero placeholder in the derived stream. The adapter must override that placeholder with an explicit unavailable value, never compare it as zero, and verify reader coordinates against the census.

Limits and structural admission supplement worker deadlines. They do not establish full format fidelity or hard process memory isolation. Tests cover independent LibreOffice input, chain corruption, metadata/token exclusion, rebuilt offsets, formula cache distinctions, counts/extents, SST and formula STRING continuations.

Format references: [Microsoft MS-CFB header](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-cfb/05060311-bfce-4b12-874d-71fd4ce63aea), [Microsoft MS-CFB specification](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-cfb/e39a41fd-965c-481b-bb48-257d18aac1f0), and the MS-XLS BIFF record layouts referenced in the qualified reader's source. These structures are independently validated; this is not a claim of exhaustive MS-XLS conformance.
