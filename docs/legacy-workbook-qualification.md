# XLS / XLSB reader qualification

2026-10-22. This is an executed feasibility spike, not production support. No production dependency, routing, UI or save behavior changed. `test/legacy-workbook-spike.cjs` requires an explicitly supplied temporary reader and fixture; it is not part of `test/*.test.cjs`.

## Dependency and fixture provenance

- Official package: `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, downloaded directly from the source recommended by [SheetJS installation documentation](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/). Package metadata reports `xlsx` 0.20.3; the included `LICENSE` is Apache License 2.0. SHA-256 observed: `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`. This is a recorded download digest, not an upstream signature or independently published checksum. Production adoption would retain license/notices and pin the archive, not use the stale npm release.
- Independent XLS producer: bundled LibreOfficeDev 26.8.0.0.alpha0, build `2c87e51eeaa2b413ff4ae097b2705eea1995d8e5`, `MS Excel 97` export. The test creates controlled ExcelJS XLSX input, converts it to BIFF8 XLS, and never uses SheetJS writing. Two sheets cover numeric values, a cached SUM formula, a boolean, Unicode, multiline text and literal formula-looking text.
- XLSB fixture: [pandas `test1.xlsb` at commit `9c8bc3e55188c8aff37207a74f1dd144980b8874`](https://github.com/pandas-dev/pandas/blob/9c8bc3e55188c8aff37207a74f1dd144980b8874/pandas/tests/io/data/excel/test1.xlsb). The official v2.3.3 annotated tag resolves to that commit. SHA-256: `ab0c0a28a93a9174a4052446f61c21a626f7411f269e72af1d258569f8b533c2`. The immutable-commit download and release-tag download matched. The upstream [BSD-3-Clause license](https://github.com/pandas-dev/pandas/blob/9c8bc3e55188c8aff37207a74f1dd144980b8874/LICENSE) permits redistribution with its notices/conditions; the subsequent reader foundation vendors this fixture and its license under `test/xlsb-fixtures`. Embedded `docProps/app.xml` identifies Microsoft Excel 16.0300. That metadata supports producer provenance but is not independently authenticated authorship. This is an upstream fixture, not a workbook generated with the reader under test.
- LibreOffice's installed filter registry supports XLS import/export but XLSB import only. No local Excel producer or installed xlrd/pyxlsb/calamine engine was found.

## Executed results

Final command exited 0; log `/private/tmp/fc-legacy-workbook-spike.log`. The successful run retained generated files and `report.json` under `/var/folders/6b/k_8gr3qj057_5n47v8y_kklw0000gn/T/fc-legacy-workbook-spike-JIvvlV`. Temporary evidence may be cleaned later; rerun the test to reproduce it.

1. Native `worker_threads` parsed both files with `cellDates:true`, `cellFormula:true`, `WTF:true`; Chrome Web Workers running the official browser bundle returned identical projections.
2. Independent LibreOffice conversion of both binary files to XLSX, read with ExcelJS, matched **16 populated XLS cells and 96 XLSB cells**. Rich-text runs from LibreOffice were flattened for value comparison; floating-point comparisons allow relative error `1e-12`. This verifies cached values in these fixtures, not formula expression fidelity, formatting preservation, or all empty/absent-cell distinctions.
3. Both native and browser workers were terminated by their owner during an intentional infinite-loop probe. Normal parse timeout is 5 seconds; the probe uses 100 milliseconds. Native worker V8 limits are 128 MiB old generation and 16 MiB young generation. The ordinary XLS source hash was unchanged after parsing/readback.
4. A half-truncated XLS failed with `Cannot set properties of undefined (setting 'name')`. A half-truncated XLSB failed with `Bad compressed size: 0 != 418`.
5. **Empty bytes, eight arbitrary bytes, and CSV bytes supplied to the binary-workbook parser were all accepted as `Sheet1`, even with `WTF:true`.** Production must positively validate the requested binary format before invoking the reader. Neither the extension nor `WTF` provides that boundary.

The first test run stopped because independent ExcelJS readback returned a rich-text object for Unicode text. The test normalization was corrected; no product or reader defect was inferred from that harness mismatch.

## What the spike does not prove

The wrapper refuses inputs larger than 32 MiB, but this alone does not bound decompression, CFB chains, parsed cells, shared strings, or output allocation. V8 worker heap limits do not bound all ArrayBuffer/native allocations, and browser workers expose no hard memory ceiling. Termination demonstrates responsiveness and cancellation feasibility, not complete denial-of-service protection. The spike does not assert encrypted-workbook support, macro execution safety through every parser path, CFB cycle rejection, malformed record exhaustion resistance, unsupported formula-cache behavior, signatures, or exact rich formatting. No user document was opened.

## Production implementation gates

1. **Validate containers before parsing.** XLS must identify its supported CFB/BIFF profile; bound sector counts and chain traversal, reject cyclic/overlapping/invalid chains, ambiguous workbook streams and unsupported encryption. XLSB must use the existing bounded ZIP validation, validate package content types/relationships and binary workbook/worksheet streams, and reject excessive record lengths, duplicates and unsupported encryption. Reject disguised text instead of guessing another format.
2. **Bound all work.** Enforce input, actual expanded bytes, record/string counts and lengths, worksheet count, nonempty dimensions and aggregate projected cells before dangerous allocation. Reject excess instead of silently cropping with `sheetRows`. A 5-second worker deadline is an additional boundary, not a substitute for these limits. Investigate native subprocess isolation if hard memory enforcement is required; a browser worker alone cannot provide it.
3. **Make semantics explicit.** Preserve typed cached values, dates/date systems, errors, sheet order/visibility, literal strings and missing formula results. Distinguish unavailable caches from empty cells and never mark them equal. Test formula and rich-format capabilities independently before enabling them. Do not evaluate macros, formulas or external links.
4. **Generalize capabilities and source protection.** Current ODS-specific checks in `src/advanced.js` must become format/capability-aware. Native source records, path/inode aliases, restored sessions and output signature checks must protect XLS/XLSB documents from value-only export overwrites. An XLS/XLSB file must never become an XLSX preservation template. Route direct, folder, shell, remote and archive inputs consistently.
5. **Acceptance beyond the spike.** Add controlled malformed CFB/BIFF/ZIP record cases, cache/date/codepage fixtures, failed-load atomicity, limits, cancellation, tabs/sessions, mixed-format copy/edit/undo and independent export readback. Run the browser and packaged Mac apps; Windows execution remains deferred. Keep the full feature backlog open, including eventual source-preserving binary-workbook editing rather than claiming values-only input is complete parity.

## Reproduce

Download the official archive above and verify its recorded SHA-256 before extracting to a temporary directory. Download `test1.xlsb` from the immutable raw GitHub URL corresponding to the source link above, and retain the upstream license if redistributing it. Then run:

```sh
FC_SHEETJS_DIR=/private/tmp/fc-sheetjs-qualification/package \
FC_XLSB_FIXTURE=/private/tmp/fc-sheetjs-qualification/test1.xlsb \
FC_SPIKE_BROWSER=1 node test/legacy-workbook-spike.cjs
```

`FC_SOFFICE` can select an alternative headless LibreOffice executable. The test requires installed project development dependencies and Chrome. All generated workbook/report files are created under a unique temporary directory. It never installs the candidate package or changes application source state.

## Source-only reader foundation (2026-10-22)

The feasibility spike has progressed to bounded XLS and XLSB preflight validators, an injected-parser cached-value adapter, and isolated worker/client modules. These modules are not yet connected to application routes. The installed application remains 2.202.0; no production dependency or package version changed.

Preflight rebuilds a narrow derived workbook stream before invoking the reader: XLS formula token bodies and unrelated records are removed, while XLSB is rebuilt from validated records and package metadata. Ordered sheet, coordinate and formula-cache censuses reconcile the parser output. Missing caches remain explicit, and styles/custom format references and repeated-string projections have independent bounds. See `xls-preflight-profile.md` and `xlsb-preflight.md` for supported profiles and limits.

Final focused validation passed 37 tests. The full suite before the last custom-format/repeated-string regressions passed 2,311 tests with one skip; the final focused run includes those regressions. Final native and Chrome worker qualifications passed against the vendored independent fixtures. These checks establish the supported reader foundation, not universal workbook compatibility or a hard operating-system memory sandbox.

Remaining integration includes dependency/license adoption, production worker bundling, capability-aware table behavior, all input routes, native source/alias protection, restored sessions, mixed-format editing and independent exports, and packaged acceptance. Values-only reading does not supply formula calculation, formatting fidelity or source-preserving binary editing.

## Production source integration (2026-10-22)

The subsequent integration adopts the pinned vendored archive and distributed license, bundles the production worker, and connects table routes, sessions, values-only editing/export and native source protection. See `legacy-workbook-input.md` for current behavior and `legacy-workbook-dates.md` for date semantics. The source build, production Chrome UI/worker tests and native workflows have been exercised; packaged release acceptance and installation remain separate pending work. Installed version 2.202.0 is unchanged. The earlier source-only sections record the preceding milestones rather than the current integration status.

## Release 2.203.0

Both Mac packages passed final workbook workflow acceptance and independent export readback. All three release archives passed byte/asset/license checks and ZIP integrity; Mac signatures, installed startup/assets, Finder Services and browser downloads were verified. The installed 2.202.0 app is retained for rollback. Windows runtime remains deferred. The production source integration milestone above is now shipped; broader workbook fidelity remains open.
