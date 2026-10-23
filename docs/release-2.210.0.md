# Further Compare 2.210.0

Packaged, verified and installed. Version2.209.0 is retained for rollback.

Table Compare adds **Compare number formats** for qualified XLSX, XLS and XLSB worksheets. A separate paginated section compares stored format codes at physical cell addresses, including explicitly styled blank cells. It can reveal changed decimal, percentage or date/time formatting when cell values are identical.

Validated binary style records and relationship-resolved XLSX metadata supply the comparison. Equivalent custom format definitions compare equally despite different IDs. Unsupported locale IDs, unrepresented default/row/column styles and ambiguous inheritance report comparison unavailable. Original bytes and existing legacy formula sanitization remain intact.

The preference survives sessions and Table Compare defaults. This does not enable full legacy formatting, formula or layout comparison, format copying, or source-preserving binary edits; legacy exports remain values-only.

Legacy workbook reads now have a finite 30-second budget, including worker startup and scheduling. An Intel packaged XLSB workflow exceeded the previous five-second limit; isolated measurements were 1.3–2.8 seconds and did not reproduce the timeout. Cancellation, queue limits and termination remain enforced. Regression coverage accepts a six-second valid read and terminates stalled work at the deadline.

Source acceptance: 2,480 tests passed, one skipped. Independent openpyxl/LibreOffice XLSX/XLS fixtures, the independently sourced XLSB worker fixture, browser pagination/sheet/session workflows and native source-immutability checks passed. Both rebuilt Mac packages passed number-format, legacy XLS/XLSB and shell-helper acceptance. All three package source/assets/maps and ZIP audits, download hashes, installed workbook assets, startup and Finder Services checks passed.

Windows runtime testing remains deferred. Public signing/notarization, modern Explorer deployment and full-product parity remain pending.
