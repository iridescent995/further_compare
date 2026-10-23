# ODS expression comparison

The ODS input projection exposes formula expressions independently from their cached results. It never evaluates formulas, converts OpenFormula to Excel formulas, or claims that two differently written expressions are semantically equivalent. Source-saving and formula copying capabilities are unchanged.

`formulaRows` contains null for literal cells or the formula display body without the namespace qualifier and initial equals sign. `formulaIdentityRows` contains null for literal/unavailable expressions, otherwise a JSON string with `dialect` (resolved namespace URI) and `expression` (exact body). Two namespace aliases resolving to the same URI therefore compare alike. Different namespace URIs remain distinct, including from the XLSX formula language. Unknown dialects retain exact expressions; they are not parsed or normalized as OpenFormula. Whitespace, case, quoted names, and string content are preserved. This deliberately conservative identity can report differences between equivalent expressions.

`formulaStatusRows` contains null for literals; supported expressions have `{supported:true,mode:'exact-expression',dialect:'openformula'|'other'}`. Unavailable expressions have `{supported:false,reason:'repeated-formula'|'unsupported-expression'}`. A non-null display formula with null identity must never be treated as equal in formula comparison. Cached values and `typedRows.odsFormula` provenance remain independent, including formulas without cached results. All added projected text counts toward the existing 32 MiB aggregate budget.

## Repeated formula limitation

Expressions in repeated rows or cells currently have unavailable identity at every repeated position, including the anchor. No relative-reference translation is invented. Cached-value projection remains available.

An independent LibreOfficeDev 26.8.0.0.alpha0 conversion probe on 2026-10-23 used a controlled ODS containing numeric A1=10/B1=20 and A2 with `table:number-columns-repeated="2"`, row `table:number-rows-repeated="2"`, expression `of:=[.A1]`, cache 10. Conversion to XLSX retained A2 with formula A1 and cache 10 but omitted B2/A3/B3, verified in raw worksheet XML and ExcelJS readback. This does not establish safe repeated-formula semantics and is not treated as proof that relative references should be shifted. Supporting these expressions requires further producer interoperability qualification.

## Evidence and checks

`test/ods-formula.test.cjs` uses the independent LibreOffice fixtures documented in `test/ods-fixtures/README.md`. It checks the actual SUM and TRUE expressions, namespace aliases and mismatches, exact quoted/literal text, missing caches, repeated coordinates and bounded malformed expressions. `test/ods-input.test.cjs` retains cached-value, package, XML and projection-bound coverage.

Primary specification: [ODF 1.3 Part 4 OpenFormula](https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part4-formula/OpenDocument-v1.3-os-part4-formula.html), especially references and whitespace syntax (§5). This implementation compares exact expressions rather than claiming full grammar validation.

Released in 2.205.0. Namespace/dialect/cache/repetition/session browser acceptance and both Mac packaged ODS workflows passed. Windows runtime testing remains deferred.
