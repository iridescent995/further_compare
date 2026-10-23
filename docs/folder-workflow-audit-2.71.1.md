# Folder workflow acceptance audit — 2.71.1

Date: 21 October 2026.

The packaged Apple Silicon folder acceptance checks passed for compact 23px rows, Name/Size/Modified columns, single-click selection, modifier/range selection without checkboxes, double-click comparison, live colors, parent status, node refresh, comparison queues, inline trees and selected-pair workflows. These acceptance runs used the 2.71.0 package before the context-only patch.

The live-color test previously advanced after seeing an already-visible workspace from the previous tab. It now waits for a newly created tab and idle state, and for each folder chooser operation to finish. The comparison, DOM identity, focus, scroll and color assertions are unchanged; the rerun passed against the same package.

A separate menu audit found that merge/sync modes had 23 top-level context items. Review merge/sync changes now lives inside Direction, leaving at most 22 top-level commands in all three folder modes. The direction regression now checks that bound for each mode, along with both directions, successful copy/delete previews, stale-menu rejection and unchanged files.

Direct inspection of the reference application was retried after the user confirmed unlocking. Computer control still reported the Mac as locked. No new reference-app observation is claimed from this retry.

Full product parity and native Windows verification remain incomplete.
