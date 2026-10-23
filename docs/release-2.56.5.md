# Further Compare 2.56.5

Opening or closing a folder branch now schedules content comparison only for nodes with pending results (including size-different files that still need the selected comparison rule). Settled root/sibling content results are reused. This narrows comparison work; expansion still refreshes the visible tree listing and detects metadata changes. Explicit Refresh, comparison-rule changes and bulk expansion retain their broader comparison behavior.

Pending requests are combined so a full refresh cannot be weakened by a later expansion request. A requested follow-up keeps its scope while an earlier comparison finishes.

The updated desktop comparison-queue test fails on 2.56.4: expanding a second branch compares root, the first branch and the new branch. It passes with this change and verifies only the new branch is compared and collapse schedules no redundant comparisons. Existing delayed-I/O cases cover opening during comparison, collapsing before a pending turn, rule changes and tab changes. Live-color, folder-expansion and comparison-rule desktop regressions also passed.

Both packaged Mac architectures passed the comparison-queue regression. The branch-scope assertions suppress the independent periodic disk refresh; normal refresh behavior is restored for the delayed-I/O cases. All three desktop packages contain matching versions and application bundles. ZIP integrity and browser download/checksum checks passed. Windows runtime testing remains unavailable on this Mac.
