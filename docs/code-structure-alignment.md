# Code structure alignment

In a two-way text comparison, open Text Options → Alignment and enable **Align code structure**. Choose Java, XML or SQL, or use Automatic with a matching filename. The option starts off and is retained in tabs, saved sessions and text session defaults.

Within a changed section, unique lexical signatures pair corresponding statements even when another statement was inserted ahead of them. For example, `send("old");` can align with `send("new");` after an inserted `audit();`. Identifiers and operators remain part of the signature; literal values can vary. XML quoted attributes and SQL literals are supported; SQL quoted identifiers retain their names.

Pairing does not declare the lines equal. It preserves original text, difference significance and whole-section copy boundaries. Selecting a physical line still copies that line; manual anchors, equal/minor rows and the final newline remain boundaries. Folder content comparison and three-way merging are unaffected.

This is lexical pairing, not an AST or semantic comparison. Repeated signatures, custom grammar regions, unsupported multiline constructs and malformed lexical constructs detected by the classifier retain ordinary pairing. Java brace balance, for example, is not parser-validated. The status area reports fallback. Inputs are bounded to 4,194,304 combined UTF-16 characters, candidate runs to 2,048 lines per side, and signatures to 8,192 characters and 256 tokens per line. Rich document conversion and broader syntax-aware alignment remain separate backlog items.
