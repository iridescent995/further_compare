# Further Compare 2.205.0

XLSX reading now follows package relationships instead of assuming conventional workbook and worksheet filenames. A bounded parser-only copy normalizes locations, namespaces and worksheet IDs; source bytes remain authoritative for session restoration and preserving exports. Populated cells and declared worksheets are checked against parser output, and unrelated parser-visible metadata is rejected instead of silently influencing comparison.

ODS supports namespace-aware exact formula-expression comparison independently of cached values. Formula mode survives supported file opens and saved sessions. Different dialects are not treated as equivalent, and this does not calculate formulas or translate OpenFormula into Excel formulas. Repeated formula cells with unqualified reference semantics remain explicitly unavailable. ODS copying and exports remain values-only, preserving original source protections.

Independent Japanese PDF fixtures now verify real predefined character-map loading and rejection when either required map is missing. PDF reading-order normalization remains planned, not implemented.

Source validation: 2,395 passing tests, one skipped; real browser formula/date/formatting/relationship tests; independent openpyxl readback; Mac Electron ODS acceptance; independent review of prefixed-cell and orphan shared-string cases. Packaged runtime and installation evidence is recorded in implementation-plan.json.

Windows runtime testing remains deferred. Public signing/notarization and modern Explorer native deployment remain pending. This release does not complete full product parity.

Both Mac packages passed ODS, arbitrary-workbook and shell-helper runtime acceptance. All three package audits and download checks passed. Version 2.205.0 is installed locally with a verified startup smoke; Finder Services remain healthy and 2.204.0 is retained for rollback.
