# Further Compare 2.38.0

Folder comparisons now offer **Text · preserve case and spaces** in the comparison selector, native menu and right-click Compare submenu. It compares decoded text after normalizing line-ending style. UTF-8 and BOM-marked UTF-16 can match despite different encodings; case, spaces, tabs, blank lines and the final newline remain significant.

Text matches remain distinct from byte matches in colors, summaries and reports. Binary, undecodable and files over 10 MiB fall back to exact byte comparison. Copy/sync previews continue to compare actual bytes. Opening a child text comparison preserves the mode's case and whitespace settings, and returning restores the folder mode.

Source validation: 425 unit tests passed, including encoding/newline normalization, significant text changes, binary fallback, cache isolation, byte-exact copy previews, report formats and session validation. Native child-comparison and context-menu workflows passed. 425 unit tests passed. Both packaged Mac architectures passed child comparison rules, decoded-text mode preserving case/spaces, parent restoration and grouped context menus. All three archives passed ZIP integrity, version 2.38.0 and 52 source/resource checks. Rebuilt website UI matched packaged assets. Download links, sizes, SHA-256 and Windows ZIP browser download passed. Windows runtime remains unverified.
