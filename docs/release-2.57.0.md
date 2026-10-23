# Further Compare 2.57.0

Right-click an expanded folder in Tree view and choose Tree → Compare this folder to re-compare only its immediate contents. Actions → Compare Selected Folder Node exposes the same command. Collapsed folders must be expanded first. Full Refresh remains available for root replacement, newly appeared directory counterparts and broader rescans.

The command updates immediate file colors and new/deleted entries, removes invalid descendants, retains unrelated loaded branches, and preserves selection/focus. It waits for an in-flight content comparison before reading the node. Periodic disk refresh remains independent.

The native regression suppresses the independent refresh timer and verifies exactly one selected-node comparison call, no unrelated listing/comparison calls, context and native menu routes, added/deleted entries and descendant eviction, retained unrelated branches and no extra tab. It is included in desktop CI.

An Intel package run also exposed pending content work whose timer fired during a foreground operation. Finishing a foreground operation now reschedules that pending comparison without widening its scope. Source node and comparison-queue regressions pass with periodic refresh suppressed for the node-scope assertions.

Both final Mac packages passed the selected-node regression. All three package versions, application bundles, main processes and preload files match the source build. ZIP integrity checks passed. Windows runtime verification and direct reference-app inspection remain unavailable; the Mac is locked for UI inspection.
