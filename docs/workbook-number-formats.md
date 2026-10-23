# Stored workbook number-format comparison

Status: packaged, verified and installed in2.210.0. Version2.209.0 is retained for rollback.

Table Compare offers **Compare number formats** for qualified XLSX, XLS and XLSB sheets. The separate paginated section compares stored format codes by physical cell address, including explicitly styled blank cells. It is independent of key-column matching and header rows. Identical values with different decimal, percentage, date/time or text formats can therefore be reviewed without claiming a value difference.

XLS and XLSB metadata comes from validated FORMAT/XF or BrtFmt/BrtXF records before third-party parsing. Custom IDs resolve to their definitions, so renumbered equivalent definitions compare equally. XLSX metadata follows the relationship-resolved original worksheet and styles XML. Supported built-in IDs resolve through a shared explicit mapping; unqualified locale-dependent IDs report unavailable. This compares stored codes, not rendered or locale-dependent appearance.

Missing sparse coordinates mean General only after default-style qualification. Non-General row/column/default styles or ambiguous inheritance that cannot be represented by the current sparse metadata report comparison unavailable. They must not produce false equality. Metadata has cell, code and expanded-text bounds. Existing formula-token removal, cached-value reading and date behavior remain in place.

The preference survives sessions and Table Compare defaults. Metadata is reconstructed from original bytes. This does not enable full legacy font/fill/border/layout or formula comparison, format copying, or source-preserving binary edits. Existing XLS/XLSB exports remain values-only.

Independent fixtures in `test/fixtures/workbook-number-formats` use openpyxl and LibreOffice BIFF8 output. They contain identical values, changed format codes at A1 and an explicitly styled blank A5, and a General sheet. The existing independently sourced XLSB fixture also runs through the real browser worker. Focused tests cover custom-ID equivalence, unsupported metadata, default styles, malformed references, bounds and retained formula sanitization.

Acceptance: 2,479 unit tests passed, one skipped. Browser workflows passed independent cross-format equality/differences, styled blanks, production XLSB worker, pagination, sheets, sessions and unavailable CSV input. Native workflows passed sessions, reopen, swap and unchanged originals. Final app and legacy-worker maps match current source. Both Mac packages passed number-format, legacy workbook and shell-helper acceptance after the bounded worker timeout adjustment. All three rebuilt package/ZIP audits and downloads passed. Installed workbook assets, startup and Finder Services passed. Windows runtime remains deferred.

Release reliability check: an initial Intel XLSB workflow exceeded the five-second worker limit. A finite30-second budget now includes startup and scheduling while retaining cancellation and termination. The final suite passed2,480 tests with one skip; all six rebuilt Mac acceptance checks passed.
