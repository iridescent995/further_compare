# Three-way document text merge

Status: shipped and installed in 2.207.0. Both Mac architectures passed packaged PDF and RTF/session workflows.

Base, Left and Right may contain any mix of PDF, DOCX, RTF, ODT and ordinary text. Document inputs are extracted into editable text projections before the existing three-way merge runs. The interface identifies the extraction scope and lists exclusions in the source note. This merges extracted text, not document formatting, layout or embedded objects. PDF OCR is not supported.

Original input bytes remain separate from edited source drafts and the merged result. Undo/redo, conflict choices, result editing and word wrapping retain their existing behavior. Document encoding controls are disabled; ordinary text still supports explicit input encodings. Output encoding applies to the separately exported text file.

Each PDF side supports Document order or Page rows. Changing a loaded PDF's policy asks before re-extracting and clearing its source edits, choices, result and history. The new policy and extracted content commit together only on success. Cancellation or failure preserves prior state. Page rows retains its existing horizontal left-to-right geometry limits and explicit unsupported-input errors.

Sessions embed original bytes, drafts and actual extraction provenance. They re-extract and validate provenance before restoring saved merge decisions. Legacy plain-text sessions remain compatible. Legacy document sessions with edited results or choices but no provenance are rejected rather than silently interpreting earlier raw-byte decisions as document text. A failed app session open returns to the previous tab, including its manual result and undo history.

Native exports protect live opened document paths and identities across tabs and windows, including hard-link aliases. Merge results cannot be saved using PDF, DOCX, RTF or ODT extensions. Generic export routes also cannot overwrite a live document source. Separate text exports are verified after writing. Saved sessions retain embedded sources and never restore disk-access authority; an embedded input is not a disk handle.

Browser acceptance covers all four formats, independent ODT/PDF fixtures, edits/history, failed and cancelled re-extraction, rejected restores, sibling cancellation and superseded extraction. Native acceptance covers source/alias guards and full-app RTF conflict resolution, session roundtrip, failed-restore rollback, undo/redo, swap and export. The full suite passed 2,421 tests with one skipped. Native PDF UI acceptance also passed using real bundled file:// modules and workers, both PDF policies and original-byte session roundtrips. Pending session restoration disables prior source panes and output. Package, download and installed startup acceptance passed and is tracked in implementation-plan.json. Windows runtime testing remains deferred.
