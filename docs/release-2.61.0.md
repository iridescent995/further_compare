# Further Compare 2.61.0

Differences and Differences with parents retain paired folders in Tree view so unopened or collapsed folders remain available for navigation. File status filtering remains active, and path searches/exclusions still apply. Retained folders keep their native directory status; their unopened contents are not classified as equal or different. Flat/recursive listing and standalone filtering utilities keep their existing defaults.

Parent difference summaries now follow filename filters independently of the visible status filter. Switching All/Differences/Context after collapsing no longer discards known descendant differences. Changing filename masks or refreshing still invalidates the relevant cached summaries.

Compare this folder stops active Expand all work before comparing its node. The regression holds a real expansion read, performs the node comparison and then releases the old read; the stopped traversal cannot expand the unrelated branch or overwrite the results. It failed before the fix because expansion remained active.

Thirteen filtering/summary unit tests passed. Native node-refresh, parent-color/filter and comparison-queue suites passed, covering collapsed navigation, neutral unopened folders, filename exclusions, retained colors, content updates, focus, delayed comparisons and no unopened-node comparisons.

Both packaged Mac architectures passed the node and parent-filter regressions. The node test now waits for a verified root-file comparison before measuring command reads, avoiding a startup timer race exposed by the Apple Silicon run. Folder-view and report regressions passed. All three package versions and app bundles match source; ZIP integrity and download link/size/SHA-256 checks passed. Windows is cross-built but runtime-unverified.
