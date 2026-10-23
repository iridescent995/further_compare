# Moved text blocks: annotation milestone

Status: packaged and installed in 2.218.0; final release acceptance is tracked in implementation-plan.json. The original design below describes the annotation milestone, not a semantic parser.

## User outcome and scope

When an unchanged method or configuration section is reordered, show a small “Moved to right line …” / “Moved from left line …” annotation and let the user jump to its counterpart. Keep the text in physical source order. The initial option is off and belongs in Text Options → Alignment, beside existing code alignment, without adding permanent toolbar clutter.

This is recognition of matching text ranges, not evidence of an edit's historical origin. It does not claim AST equivalence, semantic equivalence, function detection or full code-structure alignment. Modified blocks and ambiguous repetitions remain ordinary differences. Three-way merging, folder comparison, patch generation and automated synchronization are outside this first milestone.

Existing evidence: `src/syntax-line-alignment.cjs` uses a longest increasing subsequence of lexical signatures and explicitly keeps moved statements from crossing. `src/diff.cjs` emits ordinary physical rows, hunks and added/removed counts. Neither currently supplies linked moved ranges. Preserve these contracts.

## Exact matching semantics

Use the original comparison input lines after the application's existing line-ending normalization. Require equal line strings, including indentation, case, comments and internal/trailing whitespace. “Exact” here means exact normalized-input text, not equal original file bytes or equal encodings. Do not apply grammar masks, ignored patterns, whitespace/case normalization or literal placeholders to establish a move.

Require at least three physical lines, at least two nonblank lines and a minimum meaningful character count, initially 24 non-whitespace characters. These are conservative heuristics to avoid identifying a brace-only or blank-line sequence as a moved block; expose them as documented implementation constants, not user-configurable complexity initially. A matching range must contain all its original lines, including intervening blank lines.

Do not classify terminal-newline sentinel rows as content or extend a block across that boundary. A block whose text changed only in whitespace does not qualify initially. Future normalized matching would require a separate, explicit policy and a visible “similar moved text” distinction; it must never silently broaden the exact option.

## Candidate algorithm

Implement a pure bounded helper, provisionally `annotateMovedBlocks(a, b, result, options)`, returning separate derived metadata. It must not modify `result.rows`, `result.hunks`, source strings, anchor flags, minor flags or counts.

1. Build the eligible changed physical-line ranges from the existing diff result. Exclude equal/minor rows, explicit manual anchors, omitted-content physical-carrier hunks and terminal-newline sentinels. Retain source-side physical indexes rather than display-row indexes.
2. Within eligible ranges, index short exact-line seeds, initially three consecutive lines. Candidate hash equality is only an accelerator: verify complete line strings before accepting anything. Do not materialize every possible substring or use an unbounded Cartesian comparison.
3. Require a unique eligible candidate on each side. Extend matching seeds left and right while exact text, changed-range boundaries and manual-anchor partitions permit. Deduplicate candidates that extend to the same maximal range.
4. Suppress ranges already paired at the same ordinary diff correspondence; those are not useful move annotations. Permit crossing visual relationships only in the separate annotation metadata, never in the diff's monotonic alignment.
5. Handle overlaps conservatively: if distinct candidate pairs compete for any physical lines, omit the competing candidates instead of choosing an arbitrary longest winner. Do not annotate a copied duplicate as a definite move. Check complete accepted block occurrences across both full inputs, not merely unmatched ranges, so an equal-region duplicate cannot create false uniqueness.
6. Produce stable-within-result identifiers and `{aStart,bStart,lineCount}` metadata for disjoint pairs. IDs are ephemeral and must not be persisted as authority or reused after editing.

Independent qualification must refine seed uniqueness behavior before implementation is called complete. Common repeated three-line prefixes may cause false negatives even when a larger block is unique; a conservative omission is acceptable for this milestone, while accidental matching of repeated boilerplate is not. Document this limitation plainly.

## Bounds and fallback

Start with the existing syntax-alignment input ceiling of 4 MiB combined UTF-16 characters. Use explicit total candidate-seed, indexed-line, verified-character and output-pair ceilings, proposed at 100,000 seeds, 100,000 physical lines, 16 million compared UTF-16 code units and 1,000 pairs. Bound individual line length at 8,192 characters and reject candidates spanning more than 2,048 lines. These values must be measured against fixtures; they are proposed limits, not shipped guarantees.

Use counters and cancellation/result-epoch checks, not just wall-clock timing. Hash collision handling must consume the same verification budget. On a budget limit or unsupported input shape, return no move annotations plus a compact fallback reason, preserving the ordinary diff result. Do not publish a misleading partial set after a global uniqueness check was abandoned. Run work through the existing comparison worker path where appropriate; do not block scrolling or typing with a second synchronous full-document scan.

## Manual anchors, navigation and copy invariants

Manual anchors partition the analysis. Do not infer moves across user-specified anchor boundaries in the initial milestone. No movement annotation may rewrite `ai`, `bi`, `hunk`, row order or the pane pairing used for synchronized scrolling.

`src/live-text-diff.js` maintains physical-line maps, selection state and line-copy arrows. Add distinct compact movement badges or a context action using the new metadata; do not repurpose the existing copy arrow. The counterpart action resolves the current result's physical line range, scrolls that pane and focuses/highlights the target without invoking merge/copy. Support keyboard activation and an accessible label with side and line number. Right-click should offer the same navigation action where applicable.

Existing single-line, Command/Ctrl multiselection and whole-hunk copy must behave exactly as before, including insertion/deletion counts and undo. A movement badge is informational: accepting a hunk must not automatically delete the distant counterpart, merge both movement endpoints or introduce crossing anchors. Preserve ordinary next/previous difference navigation and filtering. If a counterpart is hidden, reveal it intentionally or explain that it is hidden; never jump to an unrelated visible row.

## Edit, undo, session and asynchronous lifecycle

Clear annotations immediately when either input changes, before the debounced comparison completes. Bind derived results to both input revisions, current comparison options and the comparison epoch. Ignore late worker output after editing, side swap, tab switch, source reload/re-extraction or changed manual anchors. Recompute after undo/redo and copy; never replay stale movement coordinates from history.

Persist only the strict boolean preference, provisionally `showMovedBlocks`, in tabs, saved text sessions and text-session defaults. Missing means false; reject malformed nonboolean values. A source-side swap exchanges the inputs and recomputes annotations instead of swapping stale ranges. Opening an old session must not enable the option implicitly. Derived pairs, hashes and input fragments do not belong in saved session settings, reusable defaults or authority records.

Likely integration points are the comparison dispatch/result acceptance in `src/app.js`, worker-side lexical alignment pipeline, `src/live-text-diff.js` decorations/navigation, `src/compact-text-layout.js` options placement, and the existing session/default validators. Determine the actual worker entry point before editing; do not create a parallel diff engine.

## Independent acceptance

Author expected physical ranges by hand in fixture files, independent of the detector. Include reordered Java methods, XML sibling sections, SQL statement groups and plain-text paragraphs. Each fixture must retain original line indexes and expected ordinary diff/hunk behavior.

Required cases:

- One unique moved block, several disjoint moves, both directions and crossing movements.
- Same text at the same correspondence, copied duplicate, repeated boilerplate, equal-region duplicate and overlapping candidates: no misleading movement assignment.
- A changed literal, whitespace-only change, case-only change and ignored comment change: do not become exact moves even if another comparison rule ignores them.
- Blank lines, short brace-only fragments, Unicode, long lines, final-newline differences, manual-anchor partitions and omitted-line carrier hunks.
- Deliberate hash collisions, maximum candidate counts, cancellation and budget fallback without changing ordinary results.
- Deep equality of rows/hunks/counts and byte-for-byte copy output with the option off versus on.
- Actual editor navigation with wrapping, compact layout, both panes, filtering and keyboard/context-menu access.
- Single-line copy, discontiguous Command/Ctrl selection, section copy, undo/redo, side swap, tab/session restore and source reload while annotation work is pending.

Qualify the browser and both packaged Mac architectures. Windows runtime remains deferred by the user; shared code and static packaging still need checks. Release notes must call this moved-text annotation/navigation, with exact-text and ambiguity limits, rather than full semantic comparison.

## Source acceptance

Final production build passed. Full suite: 2,580 passed, one skipped, zero failed. Nineteen detector and independently authored fixture tests passed. Browser/native acceptance covers compact badges, keyboard and context navigation, stable distant wrapped scrolling, immediate invalidation, stale workers, session restoration and copy/undo invariants. Option-produced printable characters remain native text input. A separate delayed shortcut-dialog focus race discovered by the broader Undo regression was fixed and passed deterministic held-response native and browser regressions. Exact logs are recorded in implementation-plan.json. Package audits and installed-app checks passed; both Mac architectures passed moved-text and deterministic line-copy/Undo checks. The final release ledger records remaining cross-platform qualification.
