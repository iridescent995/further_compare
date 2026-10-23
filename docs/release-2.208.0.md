# Further Compare 2.208.0

Packaged, verified and installed. Release 2.207.0 is retained for rollback.

Table Compare can compare stored conditional-format rules in XLSX sheets. Enable **Compare conditional rules** to inspect ranges, priorities, formulas, operators, thresholds and resolved styles in a separate paginated section. Whole-column and empty-cell ranges participate without expanding into a cell grid. Equivalent differential styles compare equally even when their workbook-local IDs differ.

Unsupported or malformed rule metadata reports comparison unavailable while admissible workbook values remain readable. Sessions and Table Compare defaults retain the option; original workbook bytes remain authoritative. Existing preserving exports keep rule, style and theme XML intact. This release compares stored rules; conditional appearance evaluation and rule copying/editing remain pending.

Source verification: 2,439 unit tests passed, one skipped. Independent workbook fixtures, browser and native workflows cover changed/equal rules, theme differences, namespace prefixes, pagination, sheet switches, sessions, swaps and preserving exports.

Windows runtime testing remains deferred. Public signing/notarization, modern Explorer deployment and broader full-product parity remain pending.

Release acceptance: both Mac architectures passed conditional-rule and shell-helper workflows. All three packages passed exact source/assets/sourcemaps and ZIP integrity checks. Mac signatures and universal Finder extensions, browser download hashes, installed asset integrity, isolated startup and Finder Services checks passed.
