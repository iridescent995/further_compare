# Workbook date projection

XLSX, XLS and XLSB date-formatted numeric caches retain their exact numeric `serial` and `date1904` source metadata. Their visible cached value uses a shared floating-date ISO serialization convention: Gregorian dates at millisecond precision render as `YYYY-MM-DDTHH:mm:ss.sssZ`. This notation does not convert the workbook's floating date through the user's local timezone.

The shared `src/workbook-date.cjs` helper has no spreadsheet-parser dependency. It recognizes a canonical millisecond only when reconstructing the serial from that millisecond produces exactly the original double. All other fractions use the exact finite decimal expansion of the IEEE-754 value; submillisecond caches are not truncated to nine digits or merged by a tolerance. Even the smallest subnormal is bounded to at most 1,074 decimal places. Raw serial and date-system metadata remain available to callers.

The Excel 1900 calendar's serial zero and fictional 1900-02-29 are explicit tagged text, never normalized through JavaScript Date into a different real day. Real serials 1–59 follow BIFF's actual dates. The 1904 date system has no fictional leap day. Negative, nonfinite, nonnumeric and year-10000-or-later values fail explicitly.

ExcelJS alone converts historical serials 1–59 one day too early, normalizes fictional serial 60 to a real day, and limits fractional values to milliseconds. XLSX projection therefore passes the original numeric worksheet cache and workbook date system to the shared helper rather than formatting the already-converted JavaScript Date. The helper itself does not change or rewrite source workbook data; source-preserving editing must retain the original numeric cache.

## Independent regression fixture

`test/xlsb-fixtures/pandas-test1-libreoffice.xlsx` is the LibreOffice XLSX readback generated in the recorded qualification run from the pinned upstream pandas XLSB fixture. The source fixture and BSD-3-Clause notice are described in that directory's README and `PANDAS-LICENSE`. Conversion used bundled LibreOfficeDev 26.8.0.0.alpha0, build `2c87e51eeaa2b413ff4ae097b2705eea1995d8e5`, as recorded in `docs/legacy-workbook-qualification.md`; SheetJS did not produce the XLSX readback.

Converted XLSX SHA-256: `3a78b41494d6e3b1aa3e1dea002fdb69cc471818168606ed9ce59b6fa469b942`.

`test/legacy-workbook-date-parity.test.cjs` checks all fourteen actual date caches in the XLSB against the independently converted XLSX read with ExcelJS. Adapter unit tests additionally cover fractional seconds, submillisecond distinctions, 1904 dates, early real dates, zero day and fictional leap day. This verifies the stated date projection profile, not all spreadsheet date formatting or calculation semantics.

## Raw XLSX acceptance

`test/workbook-date-browser.cjs` uses hand-authored XML caches linked through sheet7.xml and rId42. It verifies both date systems, serial zero and fictional day 60, distinct submillisecond literal/formula caches, mixed XLS/XLSX comparisons, values exports and preservation of original date serials, formulas and style indexes after an unrelated edit. An in-memory reproduction of the former Date conversion fails the same date oracle.

Release 2.204 retained the underlying ExcelJS numeric worksheet filename restriction. Subsequent source work now resolves actual package relationships and creates a parser-only normalized view, allowing arbitrary/nested workbook and worksheet part names while preserving original package bytes for exports. That change ships in 2.205.0 and passed packaged runtime acceptance on both Mac architectures. Negative numeric date caches and dates outside the supported calendar range fail explicitly.
