# Metadata-backed dynamic arrays: evidence and implementation plan

Investigation and source implementation dated 2026-10-22. The initial spike below led to implemented, narrowly validated XLDAPR structural support. Production guards now accept only an opaque capability from the metadata inventory; arbitrary metadata remains refused. This document records source/test status, not a packaged-release claim. No dependency change was needed. Legacy array structural support remains a separate capability.

## Primary references and concrete representation

Microsoft identifies XLDAPR future metadata with extension GUID `{BDBB8CDC-FA1E-496E-A857-3C3F30C029C3}` and `dynamicArrayProperties`. The metadata type and future metadata are connected by name. [MS-XLSX metadata](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/3dd44d53-847b-402f-a8c7-41a85024caf7).

The dynamic-array namespace is `http://schemas.microsoft.com/office/spreadsheetml/2017/dynamicarray`; `fDynamic` indicates a dynamic array and `fCollapsed` must be zero. Additional extension children exist in the schema and must not be assumed harmless. [Microsoft dynamic-array schema](https://learn.microsoft.com/ca-es/openspecs/office_standards/ms-xlsx/878c8ac4-8548-4bfb-9ad4-b1378e0efed1).

Microsoft's Office implementation note specifies a **one-based** `cm` index into `cellMetadata`, unlike generic documentation describing zero-based indices. The same page's `vm` wording is ambiguous relative to value-metadata documentation; this increment should refuse `vm` rather than extrapolate support for rich values. [Office cell implementation notes](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/2fd4e47f-0965-4c60-95bd-cff980b6c325), [external value metadata notes](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/8c8d962a-5d15-4229-a28f-2ebf88bdd6fc).

XlsxWriter provides a public dynamic-array writer, distinct from legacy static/CSE arrays. It supports explicit result ranges and single-cell anchors. This is an available independent producer, not a hand-invented package schema. [Producer API](https://xlsxwriter.readthedocs.io/worksheet.html#worksheet-write-dynamic-array-formula), [formula behavior](https://xlsxwriter.readthedocs.io/working_with_formulas.html).

## Reproducible spike

`test/workbook-dynamic-array-spike.py` uses existing bundled Python dependencies: XlsxWriter 3.2.9 and openpyxl 3.1.5. It generated `/private/tmp/fc-dynamic-array-spike.xlsx`; a deliberately narrow, test-only XML row-shift proof generated `/private/tmp/fc-dynamic-array-spike-shifted.xlsx`. Both loaded successfully through the independent openpyxl reader. Terminal result: 0; log `/private/tmp/fc-dynamic-array-spike.log`.

Observed package associations:

- Workbook relationship `officeDocument/2006/relationships/sheetMetadata` owns `xl/metadata.xml`.
- `metadataTypes` contains XLDAPR, `cellMeta=1`, `rowColShift=1`, and the producer's copy/paste/clear flags.
- `futureMetadata name=XLDAPR` has one `bk`, one extension with the GUID above and `fDynamic=1`, `fCollapsed=0`.
- `cellMetadata` contains one `bk` with `rc t=1 v=0`: type index one selects XLDAPR; value index zero selects its first future record. All produced anchors use `cm=1`; there is no `vm`.
- `C2` has `t=array`, `ref=C2:D4`, expression `A2:B4*2` and ordinary cached follower cells.
- `F2` has `t=array`, **ref=F2 only**, expression `_xlfn.UNIQUE(A2:A4)`. Therefore the saved range is not necessarily the future calculated spill footprint.
- Even `SUM(_xlfn.ANCHORARRAY(C2))` is written as an array-marked, metadata-backed single-cell anchor by this producer. Do not infer the absence of metadata from scalar result shape.

The row-shift proof keeps metadata bytes exactly unchanged, preserves `cm=1`, moves group refs/anchors and updates dependent expressions. It invalidates group caches and retains source values. openpyxl verified expressions and array ranges after loading. It did **not** calculate formulas, validate through Excel, or demonstrate Excel's insertion/deletion UI policy. No claim of Excel round-trip fidelity follows from that reader check; openpyxl must not be used to resave the production package because extension preservation is a separate concern.

The existing structural expression transformer independently maps `_xlfn.UNIQUE(A2:A4)` to `_xlfn.UNIQUE(A3:A5)`, `ANCHORARRAY(Data!C2)` to `ANCHORARRAY(Data!C3)`, and `C2#` to `C3#` for a row insertion at 2. Function names/prefixes remain intact. This is address transformation, not spill evaluation.

## Implemented source contract

The package runs a dedicated metadata inventory before legacy-array validation. Its API `prepareWorkbookDynamicArrays({entries,workbookPath,sheets})` returns a capability predicate for validated anchors, their known saved ranges, and unchanged metadata parts. The predicate must be tied to actual cell nodes/part identity; arbitrary caller booleans must not authorize `cm`.

The current implementation admits only a singleton profile: one XLDAPR type, one future dynamic record, and one cell metadata record shared by any number of anchors (`cm=1`, `rc.t=1`, `rc.v=0`). Additional records, even potentially valid ones, require future support. Validation requires exact internal relationship/content type/namespace; one unambiguous metadata part; bounded counts and XML; exact supported extension GUID; permitted flags; checked one-based `cm` and `rc.t`, checked zero-based `rc.v`; `cellMeta` and structural-shift permission; no foreign extension, metadata type, `vm`, rich value or unowned metadata relationships. Reject duplicate records/count mismatches/out-of-range indices and metadata on non-array anchors. Unknown records remain explicit unsupported work, not silently ignored.

The metadata part is retained byte-identically. Its relationship and content type declaration are retained unchanged; their containing parts also remain byte-identical unless a separate supported transformation, such as calc-chain removal, needs to edit those parts. Moving cells preserves their original `cm` index. Deleting a whole group may retain unused metadata records: do not compact them or reindex unrelated cells. This avoids creating a new metadata writer for the first supported scope.

Reuse the array-group handler for whole known-range shifts and complete known-group deletion, with an explicit validated dynamic capability. Preserve the master `t=array`, `ref`, expression prefixes and `cm`; clear numeric/string/error/boolean cached values on all known members; preserve styles and non-group source values; update cross-sheet expressions and request recalculation. Partial intersection of a saved multi-cell range stays refused. Table/merge overlap stays refused.

For **anchor-only** saved ranges, the implemented policy is a persisted-coordinate transformation. The anchor is the only known member. Whole-sheet row/column insertions before or at it move it; deletions encompassing it remove it. Operations strictly after it leave its address unchanged but still transform references in its expression and all dependent expressions. This includes operations that might intersect a future calculated spill footprint: that footprint is unknown and is neither inferred nor protected as an existing group. For example, insertion of row 3 below an anchor saved only as `F2` can expand its input reference from `A2:A4` to `A2:A5`, while the saved group remains `F2`.

This is an intentional coordinate-only policy, broader than the spike's suggested before-anchor-only restriction. It does not write new spill dimensions, invent follower ownership, or evaluate formulas. Known persisted multi-cell groups still refuse partial intersection. On export, known group caches are cleared and workbook recalculation is requested; Excel or another calculation engine determines the eventual results and spill extent, including any obstruction errors. No claim is made that these operations reproduce Excel's interactive insertion restrictions or guarantee unchanged calculated results. General partial-spill editing and dynamic spill resizing remain unsupported.

Frontend changes require separate ownership: validated dynamic annotations must survive snapshot/session/history, and generated cached followers must not become scalar overlays. Ordinary edits to any known group member remain refused. No blanket exceptions in the worksheet `cm/vm` guard, package relationship allowlist, exporter metadata guard or renderer's unsupported-formula checks.

## Acceptance gates

Use the producer fixture for actual engine export/reload, preserving metadata/source bytes and untouched package parts. Test multiple anchors sharing one record, moving rows/columns, whole deletion, surviving sibling references, known-range partial refusal, anchor-only behavior, future functions, ANCHORARRAY and cross-sheet references. Add malformed index/count/type/namespace/relationship and foreign-extension fixtures; ensure every failed edit leaves the complete package unchanged. Include cache result types, group/table/merge conflicts and bounded-work limits.

Then verify actual renderer/history/session/archive-child workflows, independent-reader loading and native export. Obtain Excel validation/calculation evidence when available; do not treat producer/openpyxl acceptance as calculation correctness. Metadata-rich values, other metadata types, dynamic spill resizing and general partial-spill editing remain tracked requirements. No dependency or release change is needed to run this spike.


## Source and verification status

- `src/workbook-dynamic-arrays.js` validates metadata ownership, XML/profile/counts/indices and actual DOM-node authority. `src/workbook-structural-package.js` and `src/workbook-structural-array-formulas.js` consume that capability without a general metadata exception.
- `test/workbook-dynamic-metadata.cjs` passes: forged and cloned-node capabilities are refused, metadata bytes remain unchanged, and malformed counts/indices/flags/namespaces/extensions/ownership are rejected atomically.
- Existing `test/workbook-structural-array-formulas.cjs` and `test/workbook-structural-package.cjs` pass after integration.
- `test/workbook-dynamic-structure-export.cjs` exercises production exports from an authentic XlsxWriter fixture, including shifts/deletion, malformed variants and independent openpyxl loading. It passed during this implementation. Independent loading does not evaluate formulas or establish Excel round-trip behavior.
- `test/workbook-dynamic-array-browser.cjs` passed validated/malformed import, known-member protection, unknown-footprint non-inference, undo/redo, session restoration and metadata-preserving export. Preservation/structural export regressions and seven typed-cell/structural session schema tests also passed.
- Native acceptance is tracked separately; builds and release artifacts require their own coordinated verification. Excel calculation validation remains unavailable.

## 2.198 release acceptance

The coordinated build and full unit suite passed (2,195 pass, one skip). Both Mac and Windows ZIPs contain the exact dynamic validator, structural transformer, frontend and hardened Explorer process transport. Mac host and Finder extension signatures, ZIP CRCs and packaged bytes passed. Final native Mac workflow acceptance and installation results are tracked in `implementation-plan.json`; independent openpyxl readback is explicitly not Excel calculation validation.

Final 2.198 acceptance completed: ARM64 and Intel native runs each passed nine independent openpyxl readbacks, session/history and archive-child workflows. Installed startup passed and Finder Services remained healthy. Installed rollback copy: `/Users/harshit/Applications/.Further Compare.previous-2.197.app`. Logs: `/private/tmp/fc-2.198-dynamic-arm64.log`, `/private/tmp/fc-2.198-dynamic-x64.log`, `/private/tmp/fc-2.198-installed-smoke.log`.
