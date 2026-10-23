# Further Compare 2.47.0

Text search now has a Regex option for regular-expression search and replacement. Patterns use multiline anchors, optional case sensitivity, variable-length matches and zero-length match navigation. Replacement supports numbered and named capture groups, literal dollars and matched-text substitutions.

Pattern evaluation runs in a worker that is terminated after one second. Invalid or overly slow patterns report an error while leaving the editor responsive. Results are discarded when the input, selection, options or active session changes. Replacement is validated before changing text and participates in undo/redo. The Regex option is saved with sessions; older sessions use literal mode.

Replace All is bounded to 200,000 replacements and 10 MB of output, with the browser's stricter 2 MB and line limits checked before applying. Large or complex patterns may need to be narrowed to finish within the time limit. Literal search retains its existing behavior.

Validation includes pattern engine and session unit tests, browser worker/timeout/stale-edit tests, existing literal tools, and native undo/redo, session persistence and tab-switch checks.

All 437 unit tests passed. Pattern tests passed in the final Apple Silicon and Intel Mac packages. Browser pattern, literal-tools and display checks passed. All three packages matched source and passed archive and download verification. Windows runtime testing remains pending.
