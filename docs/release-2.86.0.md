# Further Compare 2.86.0

Clear Session is available from the native Session menu, folder context Session & tools, and the tab context menu. It empties the chosen comparison while preserving its tab identity and comparison type. Unsaved changes use the existing Save/Discard/Cancel flow; a cancelled action leaves the comparison intact.

A successful clear resets native file paths and data capabilities, folder roots, history, plans and comparison caches. Renderer state returns to a new comparison of the same type, including clearing filters, temporary ignored marks, search state and all-contents operation overrides. Other tabs and source files are unchanged.

Source desktop checks passed for cancel, save-before-clear, discard, all three menu routes, same-tab/type behavior, neighbor preservation, clean roots/history/filters/scope and unchanged source files. Browser tab-context cancel/discard behavior was checked separately. Package validation is recorded in implementation-plan.json.

Session locking, additional window workflows, full product parity and Windows runtime remain outstanding.

Final Apple Silicon and Intel package workflows passed. All three package versions and changed assets matched source; ZIP integrity and download links, sizes and SHA-256 checks passed.
