# Further Compare 2.83.0

Folder Merge and Folder Sync Review changes now use the current include/exclude masks, search, status filter and comparison rules. The preview displays this scope, using the same dialog as other folder actions. The explicit Include all contents override remains available.

Eligibility is calculated against actual aligned filenames on both sides. Filtering never makes a source file appear missing to sync. Excluded target descendants prevent ancestor deletion. Complete snapshots remain available for stale-plan rejection, including changes to hidden files. Existing exact selection semantics are retained; selected folders do not implicitly select all descendants for Review changes. Recursive context copy remains unchanged.

Validation: 37 mapped-operation unit tests passed, including eight new filesystem tests covering both directions, alignment, normalized comparison rules, hidden descendants, excluded conflicts and stale previews. A desktop UI test passed for merge and sync previews and applying selected changes while preserving excluded backup files. Packaging verification is recorded in implementation-plan.json.

Windows runtime and full product parity remain outstanding.

Final Apple Silicon and Intel packaged workflows passed. All three asar versions and changed assets matched source; ZIP integrity and download links, sizes and SHA-256 checks passed.
