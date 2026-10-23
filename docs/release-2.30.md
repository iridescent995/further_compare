# Further Compare 2.30.0

Both appearance modes now use a broader palette. Light uses ivory surfaces with coral, mint, gold, pink and violet accents. Dark uses charcoal surfaces with brighter versions of those accents. Toolbar groups, tabs, pane headers and session cards share this palette across the browser and desktop apps. Display preferences include a palette preview. Comparison highlights retain distinct colors for changed, left-only, right-only and normalized text matches.

Folder comparisons also support ignoring case, or ignoring both case and spaces/tabs. Rules apply to files as nodes open and are retained in saved sessions. Reports distinguish normalized text matches from byte-identical files and describe the selected rule. Case matching uses JavaScript lowercase conversion, not full Unicode case folding. Line-ending styles are normalized; blank lines and the final newline remain significant. Binary, undecodable and files over 10 MiB use exact comparison. Copy and synchronization operations preserve original bytes.

Validation: 228 unit tests passed. Browser and native appearance checks passed, including theme persistence, system mode, compact/comfortable rows, paired panes, focus and mobile layout. Native folder case, whitespace and context-menu workflows passed. Windows runtime validation requires a Windows host.

Appearance and folder case workflows also passed in both final Mac packages. All three packages contain the verified source and version. ZIP integrity, download links, sizes, SHA-256 checksums and the Windows archive browser download passed verification.
