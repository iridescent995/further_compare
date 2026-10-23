# Release 2.134.0 — Precise whitespace comparison

Text and folder comparisons now support ignoring leading, trailing or embedded spaces/tabs, including every combination of these locations. Existing all-whitespace and horizontal-whitespace defaults remain compatible. Folder controls live inside Filters & options; child text comparisons inherit the chosen scope. Rules persist in sessions, reusable defaults and reports.

A shared normalizer produces comparison keys without editing original text. Folder caches and captured operation snapshots include scope provenance, preventing stale matches after changing a rule. Physical line boundaries, blank lines and the final newline remain significant. File actions copy original bytes. Grammar-based exclusions and orphan-line suppression remain separate work.

CLI text comparisons accept --whitespace-scope alongside --ignore-whitespace. Batch scripts accept whitespaceScope, validate it before execution and show it in previews and reports.

Validation: 1,099 unit tests pass with one platform-specific skip. Browser and source native matrices cover eight scopes, Unicode whitespace distinctions, closed-node exclusion, child inheritance, cache changes, sessions, swaps, defaults, reports and exact-byte copies. Existing normalized folder, selected-file report and live wrapped-editor regressions pass. Light and dark options dialogs were inspected. An older test's assertions passed but its shutdown waited on the native quit guard; retrying normal quit completed it, and disposable-app teardown now exits deterministically.

Both final Mac packages passed the native scope regression. All three ZIPs passed integrity checks, and packaged shared/native modules and renderer assets match final source. Download links, sizes, SHA-256 and browser Windows download passed; shipped branding checks are clear. Actual Windows runtime and full-product scope remain open.
