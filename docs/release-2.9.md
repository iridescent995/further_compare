# Further Compare 2.9

## Text formats

Each text side now has output encoding, byte-order mark (BOM), and line-ending controls. Supported encodings are UTF-8, UTF-16 LE, UTF-16 BE, Windows-1252, and Latin-1. Automatic opening recognizes Unicode BOMs and otherwise expects UTF-8. Use **Read as** before opening a legacy or BOMless UTF-16 file, or **Reopen** to decode the current file with a different input encoding.

Input decoding and output settings are separate. Changing the output encoding does not reinterpret the text. Saved desktop sessions retain the original input encoding for subsequent reloads, as well as the desired output format.

Files with invalid encoded bytes, unpaired Unicode surrogates, or characters that cannot be represented by the chosen output encoding fail explicitly. Saving never substitutes replacement characters. Encoded output is limited to 10 MB. Existing regular files retain their permission bits during atomic replacement.

## Line endings and editing

The editor keeps raw text separately from the browser textarea, which normally converts all line endings to LF. Untouched files retain CRLF, LF, CR, or mixed endings exactly. When editing mixed-ending text, unchanged lines retain their original separators and inserted or changed lines use the original dominant separator. Explicit LF, CRLF, or CR selection converts the whole side without adding or removing a final newline.

Encoding, BOM, and line-ending conversions participate in undo/redo and persist across tabs, side swaps, and saved sessions. A new empty file can select its line-ending style before typing. Very complex edits to mixed-ending files require explicit conversion rather than silently losing their original formatting; conversion can still be undone.

The comparison view aligns logical text lines and reports when matching text has different line endings. Format controls show each side's encoding and ending style. A delayed automatic comparison no longer overrides a subsequent explicit choice to stay in Edit view.

Native-menu Undo and Redo remain responsive while a background disk-change check is pending, matching the toolbar behavior.
A save response also preserves any newer editor format changes made while the disk write was finishing.

## Scope

These controls apply to the text workspace, including text files opened from folders and archives. Other legacy character sets, manual alignment, advanced comparison rules, remote connections, and the remaining entries in `implementation-plan.json` are still unfinished. Windows packages share the implementation but require native Windows runtime verification.

## Validation

All 97 unit tests passed, along with the affected browser and desktop regression suites. The final packaged Apple Silicon app and Intel app (via Rosetta on the development Mac) both passed the text-format integration suite: exact encoded bytes, mixed-ending edits and conversion history, tabs and saved sessions, legacy decoding, rejection of unrepresentable output, folder-file opening, and external reload. Deterministic tests also held a disk check and a save response pending to verify native history commands and preservation of newer editor settings.

All three packages were checked against the current source, bundled codec, UI, version and native helper. ZIP integrity, download links, sizes and SHA-256 checks passed. The packages are unsigned previews; Windows execution still needs a Windows host.
