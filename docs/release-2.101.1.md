# Release 2.101.1 — folder patch cleanup outcomes

A preview rejected because its target root changed, or because native confirmation failed, now disposes its staged files. A cancelled confirmation deliberately retains the preview. Foreign session or token attempts do not discard another valid preview.

When file changes succeed but staging cleanup fails, the dialog reports completed writes with a cleanup warning. File action history retains the warning in both its display and JSON export. The preview is consumed, and the UI does not automatically repeat the patch.

Validation: native preview lifecycle tests, browser dialog/history tests and the source desktop patch workflow passed. All 836 unit tests passed, including an injected cleanup failure that verifies committed output, original backups, warning propagation and consumed execution authority. Both Mac package workflows passed; all three package versions/assets, ZIP integrity and download/hash checks passed. Shipped source contains no reference branding. Windows runtime and full product scope remain open.
