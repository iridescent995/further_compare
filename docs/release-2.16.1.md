# Further Compare 2.16.1

Right-clicking an already selected folder entry now moves the keyboard/native-action focus to that row while preserving the multi-selection. Ctrl/Command+Arrow moves focus without toggling selected rows. Shift-selection whose starting row was hidden by a filter now starts at the clicked visible row, rather than including unrelated entries; subsequent Shift selections extend from that new anchor.

The new desktop interaction test checks single-click selection, native Ctrl/Command multi-selection, context focus, modified-arrow focus, Space toggling, Shift and additive ranges, hidden anchors, double-click opening exactly one comparison, and returning to the parent folder. The existing folder-view regression also passes. Prism and Aurora themes are unchanged.

Full-product parity and Windows runtime verification remain open; see `implementation-plan.json`.

Both final Mac packages passed the selection suite (Apple Silicon natively, Intel through Rosetta). All three packages match the renderer source and version. ZIP integrity and download-link, size and SHA-256 checks passed. Windows was packaged and inspected but not executed on Windows.
