# Further Compare 2.85.0

Session > Save Workspace As saves all open comparisons, in order, to a .fcworkspace file. Session > Open Workspace appends them as new tabs and restores the saved active comparison. Both commands are also in folder right-click Session & tools. Existing tabs and their unsaved state remain intact. Workspace snapshots include unsaved text, comparison options and supported advanced session content. Saving a workspace does not mark individual sessions as saved or overwrite their source files.

Workspaces contain 1–20 sessions, at most 100 MiB total, with the existing 25 MiB per-session limit. Every session uses the existing validator. Folder roots, file paths and alignments are staged before any new native contexts are published; invalid or missing paths reject the complete open. Native paths on save are taken from the corresponding live contexts. Runtime plans, caches, revisions, temporary ignored marks and capabilities are not persisted. The output uses an atomic temporary-file rename.

Forty workspace/session/alignment unit tests passed. Source desktop verification covers mixed text/folder tabs, context save, native open, active tab and tab order, wrap and filter restoration, preservation of existing dirty tabs, cancellation and missing-root rejection without partial tabs. Original compact folder selection, node-only refresh and folder-chain expansion checks also passed. Package verification is recorded in implementation-plan.json.

Window layouts, automatic startup restoration, remote connections and full product parity remain open. Windows runtime remains unverified.

Final Apple Silicon and Intel package workspace workflows passed. All three package versions and changed assets matched source; ZIP integrity and download links, sizes and SHA-256 checks passed.
