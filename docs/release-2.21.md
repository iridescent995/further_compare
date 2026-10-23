# Further Compare 2.21.0

Folder comparisons now offer **Text · ignore spaces/tabs** in the comparison selector, the context menu's Compare group and the native Folder Comparison menu. Exact SHA-256 content comparison remains the default.

This optional rule removes ASCII spaces and tabs and treats CRLF, CR and LF as the same line-ending style. It retains blank lines, line boundaries and the final newline. UTF-8 and BOM-marked UTF-16 inputs up to 10 MiB are supported. Binary content, unsupported controls, undecodable text and larger files fall back to exact byte comparison.

Exact byte matches and normalized text matches have separate colors, tooltips, accessible labels, summary counts and report statistics. Text matches do not imply identical bytes. The rule persists with each session and applies to immediate-node and recursive comparisons. Copy and synchronization previews continue to compare actual bytes.

All 163 local unit tests pass. The new desktop regression covers styling/provenance, meaningful newline differences, UTF-16, binary fallback, lazy child comparison, filtering, reports, saved sessions, native/context entry points and exact copying of a normalized match. Existing rules, reports and grouped-menu regressions also pass.

Both final Mac packages pass the new workflow, including the separate legend entries. All three package versions, native comparison modules, renderer and styles match source. ZIP integrity and browser download link, size and SHA-256 verification pass.

The broader full-product scope and native Windows runtime verification remain in progress.
