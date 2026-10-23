# Further Compare 2.209.0

Packaged, verified and installed. Release 2.208.0 is retained for rollback.

Text Compare and three-way Text Merge offer an explicit **Page columns** PDF reading mode. It reads down each column and keeps spanning headings and footers between sections. It supports staggered baselines and multiple column bands. Document order remains the default; Page rows remains available.

The mode uses geometric positions, not semantic interpretation: tables, rotated/vertical or right-to-left text and complex logical reading order remain limitations. Inter-column whitespace becomes line separators; nonblank text and intra-column spaces remain intact. Original PDFs remain unchanged. Re-extraction replaces text only after confirmation and successful extraction, retaining drafts on cancellation or failure.

Version-3 projection metadata records this policy separately from legacy document and row extraction. Native IPC, isolated Node transport, CLI/batch, sessions and source/hardlink protections validate and preserve its provenance.

Source acceptance: 2,452 tests passed, one skipped. Independent ReportLab browser fixtures verify stream-order equality, changed words, headings, multi-band sections, sessions and three-way merge restoration. Native checks cover reload, source protection and failed-open atomicity. Both Mac packages passed PDF column, three-way merge and shell-helper workflows. All three packages passed exact source/assets/maps and ZIP integrity audits. Mac signatures, universal Finder extension, download hashes, installed PDF assets, startup and Finder Services checks passed.

Windows runtime testing remains deferred. Public signing/notarization, modern Explorer deployment and full-product parity remain pending.
