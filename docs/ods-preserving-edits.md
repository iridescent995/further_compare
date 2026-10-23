# ODS workbook copies

Packaged, verified and installed in 2.212.0 on 2026-10-23. Version 2.211.0 is retained for rollback. This document describes a limited ODS editing path; it does not claim complete ODS editing or full product parity. Final source-suite and browser/native acceptance passed. Both Mac packaged workflows, all three package audits, downloads, and installed startup/assets passed.

## Using the result

Open an ODS workbook in Table Compare, choose a sheet and choose the source side for the result. Edit existing result cells as literal text or blanks, then use **Save ODS workbook copy**. Text beginning with `=` remains literal text; this path does not author or execute formulas. The selected original workbook supplies the other sheets and package content.

Save to a new `.ods` filename. The native save route refuses existing output files and source paths/aliases, including hardlink aliases, rather than overwriting the original workbook. Browser exports download a separate copy. Export result CSV and Export result XLSX remain values-only alternatives; neither should be mistaken for preserving the original ODS document.

A linked ODS entry in an archive can use the same preserving engine through the reviewed archive-result route. Applying a result changes the parent's in-memory draft with Undo/Redo. It does not change the source archive; exporting the parent archive is a separate action. A restored session does not grant a live link to an archive entry.

## What is preserved

An admitted no-op returns the exact original bytes, including original formula caches and ZIP representation. Admission validates the package manifest, XML, sizes and every file entry's integrity.

For an edited copy, the engine replaces supported literal values at existing logical coordinates. It retains cell style references and untouched workbook content. Safe repeated literal rows/cells are split into bounded prefix, edited-instance and suffix runs; other logical instances remain unchanged. Large trailing blank repeats are not expanded into millions of cells.

Untouched package-entry payloads remain byte-identical. The edited `content.xml` is reserialized; a declared manifest size for that part is updated when present. The new ZIP has the required first, stored `mimetype` entry without a local extra field. ZIP compression, ordering after `mimetype`, timestamps, comments and other container metadata are not promised to match the original.

Any actual literal edit invalidates stored formula results across all sheets. Formula expressions remain, but cached value attributes and cached display paragraphs are removed. Reopen the copy in a spreadsheet application to recalculate. The comparison editor's existing formula displays originate from the original workbook, not from evaluating the edited result. This application does not calculate ODS formulas.

## Limits and explicit refusals

- Existing logical cells only, with text or blank values. Row/column insertion, deletion, reference translation, typed numeric/date/boolean authoring, formula authoring and copying formatting into an ODS result are outside this milestone.
- Formula-cell targets, covered cells, merged anchors and protected targets are refused. Changed matrix-containing workbooks are refused, including matrices on another sheet: invalidating only their anchors would leave stale follower caches.
- Signed packages cannot be edited. Encrypted or unsupported extended manifest entries fail admission. A valid no-op can retain an otherwise uneditable document unchanged.
- Repeated rows/cells containing formulas, identities, annotations, drawings or unsupported extensions cannot be split safely and are refused.
- Embedded objects, annotations, bookmarks, identities or unsupported text inside a paragraph that would be replaced cause refusal before mutation. This also applies to formula-cache paragraphs on other sheets. Ordinary untouched cell paragraphs remain unchanged; this is not a general drawing-editing feature.
- Input/output are bounded to 32 MiB, expanded package data to 64 MiB, content XML to 16 MiB, and supported projections to 50,000 rows, 512 columns and 500,000 cells. XML node and clone budgets can refuse otherwise readable documents whose edits would expand too far.

Stored sessions retain the source binding and literal result, then revalidate the preserving export on restoration. They do not serialize a reusable permission token. Structural or typed edits incompatible with this path must use a values-only result instead.

## Evidence and remaining qualification

Source checks completed before final review:

- `test/ods-preserve-engine.test.cjs`: eight focused tests passed, covering exact no-op, independent package-payload checks, whitespace/Unicode/literal `=`, repeated runs, formula cache invalidation, unsafe targets, caller mutation snapshots and limits.
- The combined focused engine and existing reader suite passed 16 tests with zero failures.
- `test/ods-preserve-independent.cjs` passed using the independently produced fixture in `test/fixtures/ods-preserve-independent/`. The baseline was generated by LibreOfficeDev 26.8.0.0.alpha0, commit `2c87e51eeaa2b413ff4ae097b2705eea1995d8e5`, through `test/ods-preserve-independent-produce.cjs`.
- That independent test examines raw ZIP/XML payloads and formula expressions, then uses LibreOffice to reopen/recalculate and exports XLSX for value/style readback. A changed precedent produced expected same-sheet and cross-sheet results of 60 and 35. Unicode, whitespace, leading `=` literals and tested font/fill/number-format properties survived the roundtrip. Evidence: `/private/tmp/fc-ods-preserve-independent.log`.

Final acceptance: 2,491 source tests passed, one skipped. The final browser and native workflows passed, including source/hardlink protection, history/session restoration and archive review/Undo/Redo. Independent retesting confirms embedded drawing cases refuse without changing original bytes, and the LibreOffice roundtrip passes. Final built source maps match the implementation. Both final Mac packages and installed-app smoke checks passed. Windows runtime testing remains deferred at the user's request. LibreOffice qualification is not evidence of Microsoft Excel-produced ODS interoperability. The existing comparison CLI has no ODS preserving-edit command; CLI mutation support remains a separate task.

Implementation: `src/ods-preserve.js`, with UI/session integration in `src/advanced.js` and `desktop/sessions.cjs`, and native output guards in `desktop/window-runtime.cjs`. The earlier design and broader follow-on scope remain in `docs/ods-preserving-edit-plan.md`.

Package rules: [ODF 1.3 Part 2, Packages](https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part2-packages/OpenDocument-v1.3-os-part2-packages.html). Cell and repetition semantics: [ODF 1.3 Part 3, Schema](https://docs.oasis-open.org/office/OpenDocument/v1.3/OpenDocument-v1.3-part3-schema.html).

Final source evidence: `/private/tmp/fc-ods-preserve-full-final.log`, `/private/tmp/fc-ods-preserve-browser-final.log`, `/private/tmp/fc-ods-preserve-desktop-final.log`, and `/private/tmp/fc-ods-preserve-independent-guard-final.log`.

Existing XLSX browser, formatting and preserving-export regressions also passed. Their stale assertions were updated to verify the precise oversized ZIP rejection and supported structural export (shifted values/styles/comments/formulas plus exact-original Undo), without changing production behavior.
