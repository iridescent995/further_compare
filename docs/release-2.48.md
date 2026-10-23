# Further Compare 2.48.0

Paired parent folders now use the difference color when their loaded descendants contain changed, one-sided or conflicting entries. The summary follows the current filters and updates in place as content comparisons finish. It does not inflate the difference count or alter the underlying file-operation and report statuses.

The accessible label and tooltip identify this as a summary of loaded entries. Unopened contents remain unchecked; this feature does not trigger recursive scanning or claim that neutral folders are identical. Collapsing or filtering descendants removes them from the displayed summary.

Validation covers nested logical ancestors, filter scope, pending/equal entries, cycle handling, delayed real file comparisons, both themes, DOM/focus preservation, refresh clearing and no unopened-node comparisons. Existing live-color tests also pass.

Final Apple Silicon and Intel Mac packages passed the parent-summary checks. All three packages matched source and passed archive and download verification. Windows runtime testing remains pending.
