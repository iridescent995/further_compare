# Excel structural reference observations

Observed 2026-10-22 in Microsoft Excel for Mac 16.114 (build 16.114.26101123), read from the installed application's Info.plist. These are observed formula transformations, not a claim of exhaustive Excel compatibility.

## Method and scope

Generated disposable `/private/tmp/fc-3d-reference-probe.xlsx` with ExcelJS. Worksheets in order: Start, Middle, End, Result. Each has A2=10 and A3=20. Result contains:

- B1 `SUM(Start:End!A2)`
- B2 `SUM(Start:End!A2:A3)`
- B3 `SUM(Middle!A2:Middle!A3)`
- B4 `SUM(Start:End!$A$2)`

Opened this exact file in Excel's normal file chooser. Used qualified Name Box navigation (`Middle!2:2`, for example), confirmed selected sheet/ordinal before structural operations, and read the formula bar through accessibility after each operation. Insert/Delete were Home ribbon operations on selected entire rows/columns. Sheet order was also confirmed visually. Closed the fixture with Don't Save; no user workbook was opened or modified.

An earlier attempt that clicked accessibility sheet-tab buttons unexpectedly reordered sheets; its observations were discarded and the original fixture reopened. One later batched navigation entered `Start!2:2` as unrelated text into Result!B8 and inserted a Result row; that insertion was undone. All reported Start/End operations below used separately confirmed selection states. The unrelated B8 text was not referenced by any tested formula.

## Verified observations

| Operation | Formula before | Formula after |
| --- | --- | --- |
| Insert Middle row 2 | `SUM(Start:End!A2)` | unchanged |
| Insert Middle row 2 | `SUM(Start:End!A2:A3)` | unchanged |
| Insert Middle row 2 | `SUM(Middle!A2:Middle!A3)` | `SUM(Middle!A3:Middle!A4)` |
| Then delete Middle rows 2:3 | `SUM(Start:End!A2)` | unchanged |
| Then delete Middle rows 2:3 | `SUM(Middle!A3:Middle!A4)` | `SUM(Middle!#REF!:Middle!A2)` |
| Enter degenerate span | `SUM(Start:Start!A2)` | Excel immediately canonicalizes to `SUM(Start!A2)` |
| Insert Start row 2 | `SUM(Start:End!A2)` | unchanged |
| Insert Start row 2 | `SUM(Start:End!A2:A3)` | unchanged |
| Insert Start row 2 | `SUM(Start!A2)` | `SUM(Start!A3)` |
| Insert Start row 2 | `SUM(Start!A2:A3)` | `SUM(Start!A3:A4)` |
| Insert Start row 2 | `SUM(Start!A2:Start!A3)` | `SUM(Start!A3:Start!A4)` |
| Then delete Start rows 2:4 | `SUM(Start:End!A2:A3)` | unchanged |
| Then delete Start rows 2:4 | `SUM(Start!A3:A4)` | `SUM(Start!#REF!)` |
| Then delete Start rows 2:4 | `SUM(Start!A3:Start!A4)` | `SUM(Start!#REF!:Start!#REF!)` |
| Insert End column A | `SUM(Start:End!A2:A3)` | unchanged |
| Then delete End columns A:B | `SUM(Start:End!A2:A3)` | unchanged |
| Enter independently qualified bare letters | `SUM(Start!A:Start!B)` | retained as entered, evaluates `#NAME?` (no defined names present) |

Final screenshot retained sheet order Start, Middle, End, Result. The screenshot showed B1=20, B2=20, B3=`#REF!`, B4=20, B5/B6/B7=`#REF!`, and B10=`#NAME?`. Formula-bar evidence above is the primary observation; numerical results were not separately recorded at every step.

## Implementable policy

For a genuine multiple-sheet span, the tested single-sheet row/column operations preserve the shared coordinate expression exactly. Do not split the span into a union or shift all sheets' coordinates to preserve one sheet's source cells: that differs from the observed behavior. A degenerate same-sheet span behaves as an ordinary single-sheet reference after canonicalization.

Independently qualified cell endpoints are separate operands of the range operator. Transform each endpoint independently, including retaining a deleted endpoint as `Sheet!#REF!`; do not collapse them to an ordinary area and apply range-shrinking semantics. Bare independently qualified letters are not demonstrated whole-column operands and must not be rewritten as such.

Remaining unverified cases include grouped edits across all span sheets, worksheet insertion/deletion/reordering, reversed and quoted/Unicode sheet spans, 3-D whole-axis expressions, and endpoint row deletion versus endpoint column deletion combinations beyond the matrix above. Extrapolating single-sheet coordinate retention to these syntactic variants requires parser validation and focused tests; this observation is not evidence for sheet-structure operations.

## Primary documentation

- [Microsoft: Create a 3-D reference](https://support.microsoft.com/en-au/excel/create-a-3-d-reference-to-the-same-cell-range-on-multiple-worksheets) defines a common cell/range across sheets and discusses worksheet insertion/deletion/movement. It does not specify the partial row/column cases tested here.
- [Microsoft MS-XLSX formula grammar](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/3d025add-118d-4413-9856-ab65712ec1b0) distinguishes sheet-range references, single-sheet references, and reference range operators. Grammar alone does not establish structural edit behavior.

## Other tool attempts

The initial AppleScript open timed out at an exact-file access chooser and was canceled (process 47891 terminal 1); it produced no semantic evidence. The bundled isolated LibreOffice runtime is 25.2-headless-codex.1. Two CLI attempts with an isolated profile exited 0 but did not execute the supplied Basic probe, so there is no LibreOffice parity claim. No production source or build was modified for these observations.
