# Version 2.176.0

Text and folder comparisons add **Grammar…** to comparison options. Choose importance independently for line, block and Java documentation comments, and define ordered named elements using single-line patterns or literal line/block delimiters. A worker-based preview highlights original sample text, element names and importance before applying settings.

Language-specific strings and other protected constructs take precedence over custom rules. Malformed or ambiguous constructs retain the original input and surface a fallback notice. Physical line positions, original minor rows, selected-line/section copy and undo remain intact. Rules persist per session/default and flow into folder text children, reports and CLI/batch. Canonical configuration and engine version bind local/SFTP caches and operation snapshots; file operations retain original bytes.

Native Undo/Redo menu commands now reach the editor through the desktop bridge. Removing an alignment pair can be undone and redone with its dialog open; numeric input undo and unrelated dialog isolation are preserved.

See [grammar behavior, bounds and scripting](text-grammar.md). This is configurable lexical importance; full syntax-aware alignment and richer document formats remain pending.

Source checks passed: 1,817 unit tests (one skipped), browser and native grammar workflows, local/SFTP parity, 90,000 differential cases against the previous lexer, 30,000 valid XML documents and 60,000 custom span-invariant cases. Light/dark visual checks passed. Both final Mac packages passed grammar and strengthened alignment workflows. All three platform packages passed bundled-source, archive-integrity and download verification. Native-menu generation and bridge acceptance also passed for all 191 emitted renderer actions on simulated macOS, Windows and Linux. Windows runtime testing remains deferred at the user's request.
