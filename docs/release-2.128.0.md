# Release 2.128.0 — Automatic folder name matching

Optional Ignore letter case and Match Unicode-equivalent names controls pair actual file and folder names within each corresponding directory. They live in Filters & options > Pairing & alignment, the Compare context menu and the native Folder Comparison menu. Exact names and explicit manual alignments have priority. Only unique unmatched name groups pair automatically; ambiguous names remain separate. Defaults retain exact matching.

Browsing still reads only the root and expanded nodes. File-action previews build the same matching policy over a bounded metadata inventory so copying, moving, syncing, updating and filtering an unopened directory uses the real descendant destination names. Selected actions read file contents only for the selected comparison scope. Metadata discovery is limited to 50,000 inspected entries and 5,000 folders. Namespace changes invalidate previews; actual destination and backup spelling is preserved. Existing safeguards reject ambiguous destination aliases rather than merging them.

The policy is stored separately from manual alignment pairs and retained in sessions, workspaces, tabs, root changes, side swaps, reusable defaults and reports. The separate flat filename-across-folders mode retains its own matching behavior; tree-policy controls are disabled there.

Matching candidates are committed only after successful native validation. Failed or concurrent scans cannot publish partial mappings; stable logical row IDs preserve loaded-tree identity as more folders are expanded.

Validation:

- Full unit suite: 1,062 passed, one Windows-only skip.
- Model tests cover exact-first/unique groups, ambiguity, independent case/Unicode rules, manual priority, directory conflicts, stable IDs, and failed/concurrent scan publication.
- Eighteen operation tests cover both transfer directions, actual backup paths, unopened descendants, filtered copy/move/delete, sync/update, metadata-only discovery, stale namespaces and immutable policy authority.
- Source native workflow verifies actual filename pairs, no closed-node browsing, unopened nested copy, single-click selection, double-click actual inputs, both copy directions, queued rapid choices, reports, session/manual separation, reopening, swapping, opt-out and reusable defaults.
- Existing flat filename, exact-spelling and session-default native workflows pass.
- Light and dark options screenshots inspected.

Both final Mac packages pass the complete native workflow. The Intel assertions passed but test teardown initially encountered the intentional busy quit guard; a normal quit retry finished that process, and deterministic teardown for the disposable test process passes in a fresh Intel run. No product quit behavior was changed.

All three ZIPs pass integrity checks. Packaged versions, new/shared modules, changed native code and final renderer assets match source. Download sizes, SHA-256 checksums and browser Windows download pass. The shipped branding search is clear. Actual Windows execution, extension-based pairing, optional filename-spelling comparison criteria and broader product scope remain open.
