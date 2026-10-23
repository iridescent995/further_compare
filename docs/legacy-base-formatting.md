# Stored base formatting in XLS and XLSB

The source implementation adds opt-in **Compare formatting** for qualified XLS and XLSB worksheets. It compares stored font, fill, border, alignment, protection and number-format properties. This is a bounded base-formatting milestone, not complete spreadsheet rendering or source-preserving editing.

Comparison is qualified within the same format: XLS against XLS, or XLSB against XLSB. Cross-format formatting is reported unavailable, including XLS against XLSB or XLSX. Different formats currently normalize some properties differently; matching-looking signatures are not sufficient evidence of equivalent formatting.

## Addresses, blanks and defaults

The stored-formatting review uses original worksheet addresses. Key-column matching applies to the value table and does not move formatting addresses. A separate expandable review lists changed regions and their affected property groups, including changes outside the populated value grid.

Native metadata retains explicit cell styles, explicitly styled blank cells, row defaults, column defaults and the qualified workbook default. Effective precedence is cell, row, column, then workbook default. An explicit blank can therefore override both a row and a column default. For XLSB, the implicit default comes from the qualified built-in Normal parent style, not an assumption that cell-XF zero represents every absent cell.

The sparse comparator examines the full native address domain without materializing every cell. It lists at most 200 changed regions, while continuing the bounded comparison to find unavailable properties. A truncated list is labelled. Unsupported or budget-limited metadata cannot produce a claim of equality.

## Availability and limits

Availability is tracked by property group. Qualified changes remain visible when another group is unavailable; the worksheet review also reports that its overall formatting result is incomplete. Unsupported extended XF properties, unresolved fonts or colors, rich-text runs and other unqualified records are not treated as ordinary defaults. Some inputs are rejected by existing admission checks before comparison.

This comparison does not evaluate conditional formatting, reproduce table-style appearance, resolve all application-dependent font rendering, or compare complete workbook layout. A stored protection flag describes metadata; it is not a promise of security or enforcement. Exact number-format codes remain significant even when an external application displays an equivalent localized spelling.

The reader still uses the sanitized legacy parser with style parsing disabled. Native record inspection supplies bounded semantic metadata separately. The projected value grid is limited to 50,000 rows, 512 columns and 500,000 cells. Style signatures and availability descriptors are interned. If expanded style signatures exceed the 64 × 1024 × 1024 character-unit projection budget, the dense style matrices are omitted and explicitly marked unavailable; values and sparse stored-format metadata remain. Sparse comparison separately limits descriptor text, cached comparisons and total work. These limits favor an explicit incomplete result over unbounded allocation or false equality.

## Original files and output

Opening or comparing formatting does not modify the source workbook. This milestone adds no XLS/XLSB writer, no source-preserving binary workbook edit, and no binary workbook formatting writeback through an archive. Existing table export remains a separate operation, such as CSV or a newly generated XLSX; it must not be understood as preserving all legacy workbook properties. Copying formatting into an XLSX result continues to require an XLSX source and result. ODS formatting copy is also outside this milestone.

## Independent evidence

Fixture provenance, raw readbacks, producer code and hashes are recorded in [the independent fixture README](../test/fixtures/legacy-base-style-independent/README.md).

- The XLS baseline and changed workbooks were independently authored and reopened through LibreOffice UNO. Identical values isolate font, fill, border, alignment, protection, number-format, styled-blank and row/column-default changes. An explicit blank overriding changing defaults is retained as a control.
- Genuine pinned pandas and Calamine XLSB fixtures provide sampled independent readback for fonts, black/white colors, borders, alignment, default protection and selected number formats. These samples do not qualify every property or every cell.
- A clearly labelled derivative of the genuine pandas XLSB changes only `xl/styles.bin`. Independent LibreOffice readback qualifies its nondefault fill, alignment, wrapping, rotation and protection. This is independent decoder evidence for deliberately changed records, not independent XLSB producer evidence. It exposed and now guards the distinction between implicit Normal defaults and explicit cell-XF styles.

All independent document loads disable macros and external updates using named UNO constants. The six independent fixture tests pass. A focused review run of the independent, sparse-comparator, projection and availability suites passed 26 tests with no failures (`/private/tmp/fc-legacy-formatting-independent-review.log`). Full-suite, browser/native integration and packaged-release acceptance are separate gates; this document does not claim they have completed for this milestone.

## Release 2.223 acceptance

Released and installed after 2,730 passing source tests (one skipped), browser/native acceptance, independent fixture readback and code review. Packaged formatting workflows passed on Apple Silicon and Intel Macs. All three packages passed exact source/dependency audits, archive integrity and download checks. Installed startup and Finder Services passed; the prior 2.222 app is retained as a reversible backup. Windows runtime testing remains deferred. The qualification limits above remain in effect.

## Cross-format stored base styles

The current source adds mixed XLS/XLSB/XLSX base-format comparison. XLSX formatting comes from original relationship-owned styles, themes and worksheets, including sparse cells, styled blanks, row/column overrides and the Normal style. Existing same-format routes remain unchanged. Mixed comparisons use a shared semantic descriptor for both visible table cells and whole-sheet review; unknown groups cannot establish equality.

The profile compares current stored cell-XF properties. Validated cell apply flags describe future parent-style linkage rather than replacing current child properties. Independent LibreOffice reopen verifies both genuine omitted flags and a labelled derivative with all six explicit false flags. Disabled Normal-parent groups remain unavailable. See the fixture provenance in `test/fixtures/cross-format-style-independent` and Microsoft's MS-OI29500 section 2.1.721. This is stored-property comparison, not a rendering engine or a claim about future style edits.

When source formats have different native grid limits, review discloses the shared domain. Effective styles outside it are compared with their source default using cell-over-row-over-column precedence and reported separately; explicit overrides cannot leave masked unknowns or differences. Styled blanks and defaults are not limited to the populated value grid.

Automatic/system-dependent colors, unresolved theme/tint or script-dependent font semantics, rich runs, gradients and unsupported extensions remain explicitly unavailable. Known changes in other groups remain visible. Number-format codes are compared conservatively without claiming equivalence for different spellings. Original workbook bytes and source-preserving writing boundaries are unchanged. Windows runtime qualification remains deferred.

Release acceptance is pending at this checkpoint; source implementation and independent fixtures alone do not establish packaged behavior.

Final acceptance: **2.226.0** is installed. The final source suite passed 2,878 tests with one skipped. Independent fixtures, focused regression tests, browser/native acceptance, ARM64 and Intel packaged workflows, 19 static package audits, downloads and installed-app smoke all passed. Version 2.225 is retained as the rollback application. This supersedes the pending-release checkpoint above. The user requested that the goal stop after this spreadsheet fix; subsequent feature work is parked. Windows runtime testing and public signing remain deferred/outstanding as previously recorded.
