# Typed ODS workbook edits

Packaged, verified and installed in 2.213.0 on 2026-10-23. Version 2.212.0 is retained for rollback. Integrated acceptance, full-suite validation and release package checks passed. Full ODS editing and the broader product goal remain unfinished.

## Behavior

This extension adds explicit finite-number and boolean edits to existing cells in an ODS result, alongside literal text and blanks. Use explicit cell-type controls or supported value-copy actions to retain the intended type. Ordinary typing remains literal text: entering `10` does not implicitly make a numeric cell, and text beginning with `=` does not become a formula.

A type-only change is meaningful even when the displayed value does not change. Text `10` changed explicitly to number `10`, or text `false` changed to boolean `false`, produces an edited workbook with the new stored type. An edit matching both the original ordinary type and value is a true no-op and returns the exact original bytes. Zero, false, negative/fractional numbers and finite exponent notation are supported. Nonfinite numbers and incorrectly typed values are rejected. Numbers use JavaScript's finite numeric representation; this is not arbitrary-precision decimal authoring.

The source-bound edit overlay retains types independently of the displayed result strings. It is revalidated before export, session restoration and applying a result to a linked archive entry. Undo/Redo retains both displayed values and their explicit types. Integration acceptance for these routes passed.

## Preservation and limits

The extension uses the existing ODS preserving-copy engine. It retains untouched package-entry payloads and target cell style references, and splits supported repeated literal rows/cells without changing other logical instances. A changed ZIP container is not promised to retain original compression, timestamps or comments. Save a separate new ODS copy; the original file and its aliases remain protected. Archive application stages a parent draft and still requires explicit parent export.

Numeric or boolean edits to original date, time, currency or percentage cells are refused, even when their projected value looks identical. Those semantic types are not silently normalized to ordinary numbers or booleans. Existing explicit text/blank replacement behavior remains available; untouched specialty cells retain their original data. Percentage provenance is carried through the reader for source-copy eligibility, rather than relying only on its numeric display.

Formula authoring and formula-target replacement remain unsupported. After any actual edit, stored formula caches across the workbook are invalidated while expressions remain intact. Reopen the copy in a spreadsheet application to recalculate. The application does not evaluate formulas. Selected value copying from an ODS formula source uses its available original cached value and type, without recalculation or copying the expression. A missing cache is refused. XLSX formula sources are refused when copying into ODS; semantic date/time/currency/percentage sources are also refused with explicit literal-edit guidance. Formula targets remain refused regardless of source. Integrated browser acceptance of this policy passed.

Existing refusals remain: changed matrix workbooks, signed packages, protected/merged/covered targets, unsafe repeated formula/object/identity cloning, and removing paragraphs containing embedded objects or identities. Existing XML, package, text, projection and clone limits still apply. Structural changes, copied formatting, typed dates/durations/currency/percentages, formula translation/evaluation, complete legacy binary workbook preservation and CLI mutation are not included.

## Evidence

Completed source checks:

- `test/ods-preserve-engine.test.cjs`: 13 focused tests passed. Together with `test/ods-input.test.cjs`, 21 tests passed. Coverage includes zero/false, signed/fractional/exponent and extreme finite numbers, same-display type changes, exact typed no-op, repeats, invalid primitive values, semantic-target refusal, formula cache invalidation and existing no-loss guards.
- `test/ods-typed-independent.cjs` passed against `test/fixtures/ods-typed-independent/typed.ods`. This independently produced fixture comes from ExcelJS-authored input converted by LibreOfficeDev 26.8.0.0.alpha0, commit `2c87e51eeaa2b413ff4ae097b2705eea1995d8e5`, using `test/ods-typed-independent-produce.cjs`.
- Independent ZIP/XML checks and an actual LibreOffice reopen/XLSX readback verified stored numeric/boolean types for same-display text conversions, zero, false and fractions; repeated-row isolation; expected same-sheet/cross-sheet recalculation results of 20 and 15; unchanged styles, specialty cells and originals; and exact typed no-op. Evidence: `/private/tmp/fc-ods-typed-independent.log`.

This evidence qualifies the tested LibreOffice-produced files, not all ODS producers. Final integrated browser/native behavior, session/history/archive workflows, source-alias guards and full-suite validation passed. Final package acceptance passed. Windows runtime testing remains deferred at the user's request.

See `docs/ods-preserving-edits.md` for the earlier literal-copy milestone and `docs/ods-preserving-edit-plan.md` for the larger feature scope. Engine entry point: `src/ods-preserve.js:exportOdsCopy`.

## Final source acceptance

The frozen source suite passed 2,500 tests with one skipped. Typed browser coverage passed same-display type changes, numbers/booleans, stored ODS formula-value copying, history/session restoration and stale-export rejection. Existing ODS and XLSX preserving-export regressions passed. Final native tests passed typed copies, source/hardlink protection, saved sessions and archive review/Undo/Redo. Independent LibreOffice qualification and final built source-map checks passed. Both Mac packaged typed ODS and shell workflows passed, as did all three package audits, downloads and installed startup/assets.

Logs: `/private/tmp/fc-ods-typed-full-final.log`, `/private/tmp/fc-ods-typed-desktop-final.log`, `/private/tmp/fc-ods-typed-independent.log`.
