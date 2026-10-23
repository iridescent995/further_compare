# Independent cross-format base-style evidence

Produced and independently reopened on 2026-10-23 with LibreOfficeDev 26.8.0.0.alpha0, build `2c87e51eeaa2b413ff4ae097b2705eea1995d8e5`. `ConvertStyles.java` uses the existing independent [`ReadStyles.java`](../legacy-base-style-independent/ReadStyles.java) reader and its named `MacroExecMode.NEVER_EXECUTE` / `UpdateDocMode.NO_UPDATE` load policy. No application parser supplies expected values. Both producer and isolated office process exited zero.

## Files and lineage

- `baseline.xls` and `changed.xls` are exact copies of the independently authored [legacy style fixtures](../legacy-base-style-independent/README.md).
- `baseline.xlsx` and `changed.xlsx` were exported with `Calc MS Excel 2007 XML` from those fixtures' authored ODS sources. The original sources are retained in the linked fixture directory.
- `baseline-from-xls.xlsx` was exported from the retained `baseline.xls`.
- `pandas-from-xlsb.xlsx` was exported from the genuine pinned [`pandas-test1.xlsb`](../../xlsb-fixtures/README.md). Its upstream provenance and license remain in that directory. This project does not claim to have independently authored XLSB.

`libreoffice-readback.txt` records a separate reopen of each source and exported result. `manifest.py` mechanically transcribes it to `independent-readback.json` and reports observed changes in `observed-conversion-changes.json`. `sha256.json` pins the retained XLS/XLSX files. The source corpus retains the original XLSB and ODS hashes.

## Observations, not assumed conversion equivalence

The sampled cells of baseline XLS versus either XLSX version have equal UNO font, fill, bottom border, alignment, wrapping, rotation, protection and number-format observations. The sampled genuine pandas XLSB versus its XLSX export also agree for these fields. These are sampled semantic observations, not assertions that all stored XML/binary metadata, font-script selection or number-format spelling is equivalent.

ODS-to-XLSX conversion changes Liberation Sans to Arial and can quantize bottom-border widths. Those real changes are retained in the conversion report. UNO can normalize stored format codes—for example a locale prefix or localized date spelling—so matching its displayed format does not authorize erasing differences between original format-code strings.

The controlled style-only pair has the same values. A1–A7 isolate font, fill, border, alignment, protection, number format and a styled blank. Column B and row 10 have changed default fills. Explicit blank B10 keeps its own fill and overrides both defaults. Samples include B1, A10 and C10. Existing legacy readback supplies the copied changed XLS oracle.

Missing/automatic colors and unresolved theme fonts must remain explicit limitations. The source XLSX includes implicit font colors; the converted genuine XLSB retains theme color references. A matching rendered color observed in LibreOffice cannot prove an automatic color equals a fixed RGB value in every environment. Future derived missing-theme or ambiguous-color controls must be clearly labelled synthetic and must never claim independent producer coverage.

## Reproduction

Compile `ReadStyles.java` and `ConvertStyles.java` with a JDK against the official UNO library (used `org.libreoffice:libreoffice:24.2.7`). Start an isolated `soffice` profile with `--headless --norestore --nodefault --nofirststartwizard` and a local UNO listener on port 20424. Run `ConvertStyles` with source/output path pairs in the order listed above; capture stdout as `libreoffice-readback.txt`, then run `python3 manifest.py`. The producer terminates its own desktop. Source file permissions and bytes are not changed by the reader; regenerated ZIP timestamps may differ.

## Explicit cell-XF apply flags

`derived-cell-flags-false.xlsx` is a labelled synthetic derivative, not a genuine producer output. `derive-cell-flags.py` changes only `xl/styles.xml`, setting all six apply flags to false in every cell XF while retaining direct group fields and all parent style XFs. Other package payloads remain unchanged. A subsequent independent UNO reopen records **identical sampled properties** to baseline XLSX, including direct fields that differ from the parent. `derived-flags-readback.txt` retains the source and independent roundtrip readback; the source block is also in the main oracle.

This supports comparing current stored cell-XF properties consistently for omitted and explicit-false flags. It does not establish future editing/inheritance behavior. [MS-OI29500 section 2.1.721](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/68362a4b-5589-4504-b566-e8154dce1de3) distinguishes cell flags controlling future parent-style changes from parent `cellStyleXfs` flags controlling whether a style group applies. An explicitly disabled parent group remains unavailable; it must not be promoted into a known default. Derived duplicate children, missing themes and disabled parents in the tests remain synthetic safety controls.
