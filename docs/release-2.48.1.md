# Further Compare 2.48.1

Known parent-folder differences now remain colored when a branch is collapsed, including Collapse All. Reopening a parent can show a previously compared collapsed child without reading that child's contents again.

The cache records differences only; it never infers equality. Refresh, changed filters, a different folder pair/session or changed comparison rules invalidate remembered summaries. Reopened branches update from their loaded entries. Tooltips explain that collapsed results are cached. The cache is bounded to 50,000 folder identities.

Validation covers nested collapse/reopen, Collapse All, explicit refresh of collapsed entries, subsequent content refresh, filters, both themes and no comparisons of unopened folders.

Eleven focused unit checks and both final Mac package tests passed. All three packages passed source, archive and download verification. Windows runtime testing remains pending.
