# Release 2.123.0 — Additional Windows text encodings

Explicit text input/output now supports Windows-1250 (Central European), 1253 (Greek), 1254 (Turkish), 1255 (Hebrew), 1256 (Arabic), 1257 (Baltic) and 1258 (Vietnamese). The choices also appear in folder text-encoding rules and folder patch controls. Shared codec consumers, including CLI and batch jobs, accept these names.

Mappings follow the [official Unicode-hosted Microsoft tables](https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/), with individual source URLs and SHA-256 hashes recorded in `src/windows-codepages.cjs`. Undefined bytes are rejected. Output rejects unrepresentable characters without replacing a destination file. Auto remains Unicode BOM/UTF-8 based. Windows-1258 preserves combining sequences exactly; automatic normalization of precomposed Vietnamese characters is not performed. Existing Windows-1251/1252 behavior is unchanged.

The native regression exposed an existing saved-session defect: requested Read as choices were not persisted independently of output format and source provenance. Sessions and tab snapshots now retain a validated `readEncodings` pair, swap exchanges both choices, and changing a choice marks the session dirty. Older sessions use their known source encoding when available, otherwise Auto; blank sessions start with Auto.

Validation:

- All 896 high-byte mapping positions independently match Python's strict codecs; exhaustive valid-byte roundtrips, undefined bytes, BOM restrictions and output rejection pass.
- Browser imports and CLI Unicode comparisons pass for seven independently encoded multilingual fixtures.
- Native source tests pass all seven exact-byte input/save workflows, Greek/Arabic edits, session reopening, swapping, tab isolation and rejected lossy saves.
- Greek/UTF-8 folder comparison, expanded child decoding, inherited input codecs and saved folder sessions pass.
- Full unit suite: 995 passed, one Windows-only skip.

Both final Mac packages pass the complete native encoding workflow. All three ZIPs pass integrity checks; versions, packaged codec tables/native sessions and final renderer/CSS assets match source. Download sizes, SHA-256 and Windows browser download pass. The shipped branding search is clear. Windows runtime and broader full-product scope remain open.
