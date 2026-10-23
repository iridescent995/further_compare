# Legacy DOC text comparison

Further Compare can extract a qualified stored-text profile from binary `.doc` files for two-way comparison and three-way merge. The source is immutable: editing changes an extracted text draft, and saving produces a separate text file. This is a partial document-comparison milestone, not a Word renderer or a DOC editor.

## Scope and reference identity

The default `main-document` scope includes the main story. Explicit `main-and-related-text` also includes qualified footnotes, endnotes, comments, body and header text boxes, stored section header/footer variants, and note separator stories. Text Compare and three-way merge expose a scope selector and an explicit re-extract action for each source. CLI accepts `--doc-scope`; batch text jobs accept `docScope`, using the same two values.

Related output inserts canonical markers such as `[DOC reference: Footnote 1]` and `[DOC reference: Comment 1]` at their qualified text positions, then appends labelled stored parts. Ordinals follow validated stored tables, not author names or arbitrary storage IDs. Moving a reference can therefore change the full-related comparison even when the body and related story strings are otherwise identical. Header text-box references are retained inside their containing related story. A deleted or field-instruction reference does not manufacture a visible anchor.

Header/footer labels identify stored section slots and variants. Empty later-section slots are marked as inherited; separator slots are explicitly labelled. These descriptors do **not** establish rendered page placement or reproduce pagination. Comments include their stored text, not author identity. Generated list and reference numbering, images, embedded objects, visual formatting and layout are excluded.

Field instructions are excluded and stored results retained without evaluation. Stored hidden and inserted text is included; supported deletion-marked text is excluded. This is an explicit stored-text policy, not an assertion of Word's current display or accepted-revision view.

## Drafts and source protection

Changing the selector alone does not reinterpret an existing draft or change its saved provenance. Re-extraction requires confirmation before replacing edits. Cancellation and failed native reads leave the committed source and draft intact. During native re-extraction the workspace and open dialogs are locked through read and renderer commit; native editing commands are blocked too.

Sessions retain validated version-1 DOC projection metadata (`stored-story-text-v1`) and the committed scope. Contradictory scope metadata is rejected. Browser sessions retain extracted drafts, not authority to reread an unavailable original; re-extraction then requires reopening the source. Native reload and swap retain committed provenance.

Direct opening, folder file comparison and archive entry comparison route DOC through document extraction. Folder single-click selects; double-click opens the comparison. Archive DOC drafts cannot be applied back into the archive as replacement DOC bytes. Native text export refuses document extensions and original-source identities, including hard-link aliases. Archive and original bytes remain unchanged. The parser neither evaluates fields nor executes embedded content, macros or external-link updates.

## Qualified profile and refusal boundaries

The structural reader admits the explicitly checked binary FIB profiles `0x00C1`, `0x00D9`, `0x0101`, `0x010C` and `0x0112` in validated CFB v3/v4 containers. Admission of a version is not proof of every property or producer variant in that version. The genuine independent fixtures exercise the LibreOffice-produced `0x0101` profile; other supported layouts also have structural controls.

Encrypted or obfuscated DOC files and unsupported versions are refused. Malformed stream ownership, FIB/CLX bounds, story coverage, character/paragraph property coverage, fields and reference tables fail explicitly. Dirty pieces, piece-level property modifiers, style-relative deletion toggles, indirect paragraph properties, selected symbol/structural transformations and extended tab-property layouts remain unsupported. Related boundaries inside fields and annotations in table contexts are also refused. There is no silent fallback to a body-only or raw-byte interpretation when requested extraction fails.

The implementation bounds input and compound stream totals at 32 MiB, directory entries at 4,096, story characters at 8 Mi, pieces at 100,000, property runs at 200,000, field nesting at 64, and text work at 16 million steps. Published UTF-8 text is limited to 8 MiB and projection parts to 10,000. Intermediate and reference structures have additional limits. Browser and Node extraction run in disposable workers with a 30-second deadline, cancellation, at most two active jobs per client instance, validated responses, and termination on completion or failure. Node workers additionally have explicit heap and stack limits. Limits reject rather than publish partial results.

## Independent evidence and release status

[Fixture provenance](../test/fixtures/doc-independent/README.md) records independently authored Flat ODF, genuine LibreOffice DOC export, and a separate UNO reopen/readback with the named `NEVER_EXECUTE` and `NO_UPDATE` policies. Fixtures cover Unicode including supplementary characters, paragraphs, tabs, manual breaks, an empty table cell, a stored date result, notes, comments, body/header text boxes and two section header/footer sets. Related-only and body-only variants isolate story changes. A genuine moved-anchor variant keeps all seven stored story strings identical while relocating the footnote and comment references.

Independent tests use that readback as their content oracle. Labelled malformed derivatives exercise FIB/CLX/property/reference bounds and direct revision flags; they are not presented as independent producer evidence. Worker tests qualify cancellation, response validation and resource handling. Browser and native acceptance cover scopes, pending-selector provenance, cancelled drafts, locked delayed reads and atomic failure, sessions, source aliases, and folder/archive routing. Three-way and CLI/batch qualification are separate integration gates.

The source integration suite passed **2,841 tests** before release 2.225 packaging. The two-way browser and native acceptance tests passed against the frozen source build. Release 2.225 package, installed-application and release-signature checks are still pending at this checkpoint; source tests do not establish those results. Windows runtime testing remains deferred because no Windows machine or runner is available. Public signing/notarization verification is not newly established by this milestone. Full document fidelity and full product parity remain unfinished.

Packaged Intel three-way acceptance subsequently exposed a scope-control race during initial merge computation. The fix starts computation before rendering controls, guards re-extraction while busy, and disables document controls during source-edit debounce while retaining source editing. A deterministic browser test holds the real merge-worker response and exercises stale handlers. The post-fix suite again passed 2,841 tests with one skipped; five related merge browser regressions and native DOC three-way acceptance passed. Final packages must be rebuilt and requalified before installation.

**Final release acceptance:** version **2.225.0** was rebuilt with the timing fix and installed. Two-way and three-way DOC workflows passed in both ARM64 and Intel packages, including the previously failing Intel test unchanged. All 18 final static package audits passed, download links/sizes/SHA-256 passed, and the installed application's exact worker assets and startup smoke passed. Finder Services are complete and current. The previous 2.224 application is retained as a rollback backup. These results supersede the pending-release checkpoints above. Windows runtime testing remains explicitly deferred; public signing/notarization remains outstanding.
