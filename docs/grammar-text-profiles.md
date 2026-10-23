# Text comment profiles

The Text format control provides Plain text, Automatic · filename, Java, XML and SQL choices. Java, XML and SQL recognize lexical comments and treat differences in those comments as minor. They do not parse full language grammars, execute code, reformat documents or infer language semantics. Auto chooses among these profiles using the filename rules below.

In text comparison, choose a format in comparison options. Enable Show minor to inspect ignored comment differences. Original text remains visible and editable. Navigation and section-copy actions use substantive differences; explicit line selection can still copy original selected text. A whole comment-only physical line may be ignored, but final newline differences remain important. Existing whitespace, case and blank-line rules remain separate choices. When a newline-terminated file contains only ignored comments but still differs structurally from the other side, the comparison shows a whole-file copy section. This keeps its newline and comment carrier together; copying that visible section does not repeatedly add and remove a blank line.

For folder comparison, select a Text comparison method, then select Text format. An explicit format applies to all eligible files in that comparison; Auto resolves separately for each file pair. It is retained but disabled for byte or metadata comparison methods. Opening a text child inherits an active text profile; inactive folder profiles do not become active child rules. Profiles persist in sessions and saved defaults. Profiles do not change copy, move, backup or synchronization bytes.

Folder text equality, selected-file content reports and standalone text comparison use the same profile keys. Folder cache identity includes the profile, and captured comparison snapshots reject use with a different profile. Binary, undecodable and files larger than the existing 10 MiB folder text ceiling retain exact-byte comparison. Worker runtime failures are errors, not successful normalized matches.

## Recognition and conservative behavior

- Java recognizes line and block comments while protecting strings, character literals and text blocks. It keeps a token separator when removing an inline comment would otherwise join tokens.
- XML recognizes comments while retaining quoted attributes, CDATA and processing instructions. Comments are zero-width within XML text content.
- SQL recognizes whitespace-qualified `--` comments and ordinary block comments. Quoted strings, quoted identifiers, PostgreSQL dollar strings and Oracle alternative quotes are protected. SQL optimizer hints and executable comments remain significant.

Unfinished or ambiguous lexical constructs retain the whole original input. Examples include Java Unicode escape preprocessing, XML DTD declarations, nested SQL block comments, SQL backslash string ambiguity, `#` dialect ambiguity and non-whitespace-qualified SQL `--` syntax. This fallback can produce more differences; it does not silently discard uncertain content. These are comment profiles, not validators of syntactic or semantic equivalence.

Ignored-text regular expressions run after lexical comment preparation. They affect remaining line comparison keys and cannot invent comment or string syntax. Original line positions are retained. Pattern-empty lines remain significant unless the original line is eligible for a separate blank-line or comment-line rule.

## Command line and batch

Use `--text-profile plain|auto|java|xml|sql` with text comparison:

```sh
node scripts/compare.cjs --left before.java --right after.java --type text --text-profile java --format json --output report.json
```

The option can combine with `--ignore-case`, `--ignore-whitespace`, `--whitespace-scope`, `--ignore-blank-lines`, `--ignore-patterns`, and explicit input encodings. Reports identify the profile and preserve original rows. Exit status is 0 for a match under the chosen rules, 1 for substantive differences, and 2 for an error. Existing report destinations are not overwritten. The CLI profile option is restricted to text mode; CLI folder comparison remains its existing snapshot workflow.

Batch version 1 jobs accept `textProfile` for text jobs:

```json
{
  "version": 1,
  "jobs": [
    {
      "left": "before.java",
      "right": "after.java",
      "output": "report.json",
      "type": "text",
      "format": "json",
      "textProfile": "java"
    }
  ]
}
```

Run `node scripts/batch.cjs --script jobs.json --dry-run` to inspect the plan, then omit `--dry-run` to create reports. The application batch review also identifies the profile. Invalid profile names and profiles supplied for non-text jobs are rejected.

## Remaining scope

Full language-aware token comparison, syntax-aware alignment and richer document formats remain pending. Configurable comment importance and named custom elements are described in [Text grammar](text-grammar.md). These comment profiles are one part of text comparison support, not full product parity.

## Language references

The lexical boundaries and conservative choices are informed by the [Java Language Specification, lexical structure](https://docs.oracle.com/javase/specs/jls/se19/html/jls-3.html), [PostgreSQL lexical structure](https://www.postgresql.org/docs/17/sql-syntax-lexical.html), and [MariaDB comment syntax](https://mariadb.com/docs/server/reference/sql-statements/comment-syntax). SQL dialects disagree on comment and escape syntax, so uncertain nested-comment and backslash cases deliberately retain the full original input.


## Automatic filename profiles

Choose **Automatic · filename** or pass `--text-profile auto`. Filename rules version 1 uses the literal, case-insensitive final extension of each supplied basename (both `/` and `\` path separators are supported):

| Extension | Profile |
| --- | --- |
| `.java` | Java |
| `.xml`, `.xsd`, `.xsl`, `.xslt`, `.svg`, `.xhtml`, `.wsdl`, `.fxml` | XML |
| `.sql` | SQL |
| Any other or extensionless name | Plain text |

Every nonempty filename in a comparison must resolve to the same profile. Different supported profiles, or one unsupported filename, fall back to plain text for the whole pair. Missing/unnamed sides are ignored; two unnamed inputs use plain text. A bare extension such as `.java` is treated as extensionless. Filename metacharacters are literal; contents are never guessed. An explicitly chosen profile always overrides filename detection.

Automatic folder comparison resolves each file pair independently, including manually aligned names. JSON reports retain the requested `textProfile: "auto"`, the effective `resolvedTextProfile`, and `textProfileRulesVersion: 1`; content reports include this per pair, folder reports include it for normalized-text entries. Human-readable reports display the effective result. Non-text methods retain the requested rule without applying it. Batch review shows the requested automatic profile and effective profile before running; actual comparison resolves again from the paths used for the job.

Automatic detection changes comparison keys only. It does not rewrite original contents, copy results or source bytes. Comment importance and custom elements can be configured through [Text grammar](text-grammar.md).


## Custom filename mappings

Open **Filename formats…** in Text options or Folder rules. Add ordered filename patterns and choose Plain text, Java, XML or SQL for each. The first matching rule wins before built-in extension detection. Use `*.ddl → SQL` for database scripts, or `*.generated.java → Plain text` to keep generated-file comments significant. Move rules up or down to change precedence. The dialog previews both filenames, the winning rule and the effective pair profile; preview edits do not rename files.

Patterns match only the basename, without case sensitivity. `*` matches zero or more characters and `?` matches one Unicode character. Other characters, including regex metacharacters, are literal. Patterns cannot contain path separators or control characters. Up to 32 rules of 128 characters each are supported. Filenames exceeding 1,024 UTF-16 code units conservatively use plain text. Conflicting resolved profiles still use plain text for the pair. Explicitly selected formats retain the mappings without applying them.

Mappings are saved independently with tabs, sessions and defaults. Folder text children inherit the current folder mappings. Changes rerun comparisons while retaining original contents and undo history. Cache and operation-snapshot identities include the exact ordered mappings, so changed rules cannot reuse an earlier normalized result.

For scripting, save a JSON array:

```json
[
  {"pattern": "*.generated.java", "profile": "plain"},
  {"pattern": "*.ddl", "profile": "sql"}
]
```

Pass `--text-profile auto --text-profile-mappings mappings.json` to `scripts/compare.cjs`. Batch text jobs accept the same array as `textProfileMappings` with `textProfile: "auto"`. CLI/batch reject mapping input for non-text comparisons or explicit profiles. Reports retain the ordered configuration and effective profile; desktop batch review shows the mappings before execution.
