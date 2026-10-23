# Further Compare 2.54.1

Collapse all now queues through the folder-action dispatcher instead of silently dropping a click made during an active folder operation. The dispatcher also rejects stale session/selection contexts.

A deterministic regression holds a native folder refresh, clicks Collapse all, then releases the refresh and verifies that descendants disappear. It fails against the prior 2.54.0 package and passes in source and both rebuilt Mac packages.

The folder audit also passed in source and both packaged Mac architectures:
- Selection: 23px compact rows, exactly Name/Size/Last modified columns, no checkbox selection, single-click selection, native modifier toggles, Shift ranges, context focus, double-click opening exactly one child and returning to the parent.
- Expansion: subtree isolation, in-place collapse, expand all, explicit cancellation during delayed IO and cancellation on session change.
- Live colors: content result provenance, distinct completed statuses, unchanged DOM rows/selection/focus/scroll and filter updates as pending results arrive.
- Comparison queue: nodes opened during comparison are revisited, collapsed nodes are skipped, and stale results cannot overwrite a changed rule or new tab.

All 16 native tree tests passed, including hash-cache evidence that unopened descendants are not read. The generated expanded-tree screenshot was inspected. No reference-product branding was found in application source/assets. These checks do not prove complete reference-product parity: direct inspection remains unavailable while the Mac is locked, and broader features and Windows runtime verification remain outstanding.

All three package versions and UI bundles matched the build; ZIP integrity and download links, sizes, hashes and actual Windows ZIP download passed.
