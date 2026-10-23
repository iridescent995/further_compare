# Text grammar and importance

Open **Grammar…** in Text options or Folder rules. Built-in comments can be important or unimportant independently: line comments, block comments and Java documentation comments. The default keeps recognized comments unimportant. Custom named elements can mark matched text important or unimportant. Original text stays available for editing, copying, saving and minor-difference display.

Custom elements run in list order; the first match wins. Move a more specific element above a broader one. Choose:

- **Pattern:** a case-sensitive or case-insensitive regular expression inside a single physical line and an unprotected code segment. Anchors and lookarounds see that segment, not an arbitrary suffix. Patterns cannot consume protected tokens or cross line boundaries.
- **Line:** a literal, case-sensitive opener extending to the end of the physical line.
- **Block:** literal, case-sensitive opening and closing delimiters, including multiline regions. An optional literal escape skips the following Unicode character while finding the terminator. Blocks do not nest.

The language scanner recognizes built-in constructs before custom elements. Java strings, characters and text blocks; XML attributes, CDATA and processing instructions; and SQL literals, quoted identifiers and executable/optimizer comments remain protected. Existing comments use their built-in importance setting. Plain text has no language-specific protected syntax. Once a custom line or block opener wins, that element owns its region, including any quote-like content, until its terminator.

**Preview grammar** runs in a separate bounded worker. It shows the original sample text with element names and importance, plus the resolved filename format and any conservative fallback. Preview samples are limited to 16,384 characters per side. Editing a preview filename does not rename a file. Preview truncation can leave a region unfinished; use a complete sample to inspect its intended classification.

Ambiguous language syntax, unfinished regions and zero-width pattern matches retain the original input rather than discarding partial matches. Comparison and preview show a fallback notice. Existing ambiguity handling includes Java Unicode escapes, XML DTDs, and dialect-dependent SQL syntax. Custom elements do not provide a full language parser or syntax-aware alignment.

Configuration is isolated per tab and saved in sessions/defaults. Folder text children inherit active grammar rules. Non-text folder methods retain the settings without applying them. Changing rules invalidates comparison results and retains edits and undo history. Exact canonical configurations and the grammar engine version bind folder caches and operation snapshots. File operations still use original bytes.

## Limits and scripting

Configuration supports 32 elements with unique names up to 64 characters. Patterns allow 256 characters; literal delimiters allow 128 and escape sequences 16. Inputs remain bounded to 20 MiB and 100,000 physical lines; classification allows at most 200,000 spans. Worker execution deadlines also apply. Existing per-line ignored-text patterns remain a separate post-grammar step and may affect text that the grammar keeps important.

Example `grammar.json`:

```json
{
  "version": 1,
  "importance": {"docComment": "important"},
  "elements": [
    {
      "name": "Generated region",
      "kind": "block",
      "importance": "unimportant",
      "start": "[generated]",
      "end": "[/generated]",
      "escape": ""
    },
    {
      "name": "Build number",
      "kind": "pattern",
      "importance": "unimportant",
      "pattern": "build=[0-9]+",
      "matchCase": true
    }
  ]
}
```

Pass `--text-grammar grammar.json` to `scripts/compare.cjs`, with any text profile including plain or automatic. A batch text job accepts the same object as `textGrammar`. Reports retain the canonical configuration and engine version. Non-text CLI/batch jobs reject grammar rules. Changing a reviewed batch configuration requires a new review.
