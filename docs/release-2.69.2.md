# Further Compare 2.69.2

The File actions scope is now local to each comparison tab. Previously, choosing All contents in one tab also changed the effective setting in another or newly opened tab. New comparisons now start with Matching files, while returning to an existing tab restores its own explicit choice.

All contents is a temporary operation override, not a saved-session option. Reopened comparisons retain their filename filters and start with Matching files. Closing a tab clears its override.

The desktop regression reproduced the cross-tab failure before the fix. It now verifies independent tabs and save/reopen behavior, in addition to actual filtered copy, move, delete and external-destination operations.

Both final Mac packages passed the extended regression. The browser regression passed startup, tabs, comparison, sessions, filters, large inputs and mobile checks. All three package versions/renderers, ZIP integrity and download hashes were verified. Windows runtime testing and full product parity remain outstanding.
