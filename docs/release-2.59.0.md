# Further Compare 2.59.0

Both appearances now use coral, gold, orchid and mint navigation accents, warm ivory light surfaces and charcoal dark surfaces. Toolbar icons match their groups. Comparison highlights retain distinct changed, left-only, right-only and matching colors. Shared styling applies to browser, macOS and Windows builds.

Archive trees can extract selected left or right files and folders from the toolbar or context menu. Selected folders include unopened descendants. Extraction preserves relative paths and file bytes in a newly created destination subfolder. Native validation rejects unsafe or colliding paths, invalid data and plans exceeding 5,000 entries (including implicit directories) or 64 MiB. Cancel leaves the destination unchanged; failures clean partial output. Source timestamps and permissions are not preserved.

Browser appearance checks and both packaged Mac appearance suites passed. Screenshots were reviewed for light and dark themes; mobile overflow, compact rows, paired panes and persistence checks passed. Five native extraction unit tests, source extraction/save/race suites and both packaged Mac extraction suites passed. Package versions and shared resources match source; all three ZIP integrity checks passed. Windows was cross-built; its runtime remains unverified.
