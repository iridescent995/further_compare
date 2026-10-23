# Release 2.116.2 — Folder disclosure double-click

Double-clicking a folder expansion arrow now expands or collapses it exactly once. Previously both click events scheduled toggles, returning the folder to its starting state. The second click now restores row selection/focus without scheduling another scan, and the double-click does not bubble into the row-open action.

Source verification reproduced the bug with actual double-click input in all four cached expand/collapse cases across the left and right panes. The fix passes those cases with shared inline expansion, selected/focused row and unchanged comparison tab count. Folder selection and file double-click opening, automatic single-child-chain expansion, node-scoped comparison queuing and grouped context menu checks also pass.

Both Apple Silicon and Intel Mac packages pass the disclosure regression. All three ZIPs pass integrity checks, bundled version/renderer assets match, download sizes and SHA-256 pass, and the Windows ZIP downloads successfully in the browser. Shipped UI/native sources contain no reference-product branding. Windows runtime remains unverified. The larger full-product scope remains open.
