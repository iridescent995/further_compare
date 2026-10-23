# Further Compare

A private text, folder, binary, table, image, WAV/AIFF/FLAC/MP3 audio, archive, and exported registry-file comparison product with a static website and Electron desktop app. No accounts, backend, telemetry, CDN dependencies, or file uploads to a server.

## Desktop downloads

Desktop ZIP packages are distributed through [GitHub Releases](https://github.com/iridescent995/further_compare/releases):

| Platform | ZIP package |
| --- | --- |
| macOS Apple Silicon (arm64) | `Further-Compare-mac-arm64.zip` |
| macOS Intel (x64) | `Further-Compare-mac-x64.zip` |
| Windows (x64) | `Further-Compare-windows-x64.zip` |

Release assets include `SHA256SUMS.txt` for verifying the downloads. ZIPs stay outside Git history because they exceed GitHub's 100 MiB file limit. Maintainers publish the prepared files from the local `release/` folder as assets on a GitHub Release matching the app version.

## Run

Requires Node.js 24 and npm. The test suite also uses Python 3 to generate independent TAR fixtures.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4173 for the product page, or `/compare.html` for the browser workspace. `npm run build` generates the deployable static site in `dist/`. Serve that directory over HTTP(S); opening source HTML directly via `file://` does not support the comparison worker consistently.

```sh
npm start              # Native desktop app
npm test               # Text engine and real filesystem tests
node test/browser.cjs  # Chrome UI tests; start npm run dev first
node test/desktop.cjs  # Native Electron integration tests
```

Browser test uses installed Google Chrome. Desktop integration uses an installed Electron runtime, temporary folders, and native-dialog stubs; it tests the real renderer, IPC bridge and filesystem service. `FC_EXECUTABLE` can select another matching Electron executable. `FC_SMOKE=1 npm start` runs a brief native smoke check.

## Capabilities

| Capability | Browser | Desktop |
| --- | --- | --- |
| Text compare, whitespace option, change navigation | Yes | Yes |
| Drag/drop and BOM-aware Unicode / explicit legacy text loading | Yes | Yes |
| Export JSON comparison report | Yes | Yes |
| Search/replace, bookmarks, line copy, inline differences | Yes | Yes |
| Light/dark/system appearance and display preferences | Yes | Yes |
| Encoded text Save As | Download | Native dialog |
| Text section/selected-line copy, undo/redo | Yes | Yes |
| Three-way text merge with explicit conflict resolution | — | Yes |
| Three-way folder merge, output preview and reviewed recovery | — | Yes |
| Binary offset comparison and byte editing | — | Yes |
| CSV/TSV/XLSX worksheet comparison and editable results | — | Yes |
| Image pixel comparison, overlay, and difference export | — | Yes |
| WAV/AIFF/FLAC/MP3 sample comparison, offset, waveform, and playback | — | Yes |
| Read-only ZIP/JAR browsing and entry comparison | — | Yes |
| Exported registry-file comparison and edited .reg output | — | Yes |
| Loaded-files view, sorting, and parent-tab navigation | — | Yes |
| Folder snapshots and saved-state comparison | — | Yes |
| Expanded-node folder comparison by SHA-256 content | — | Yes |
| Selected-file folder merge | — | Yes |
| Directional mirror sync with deletion preview | — | Yes |
| Backup replaced/deleted files | — | Yes |

Browser limit: 2 MB and 30,000 lines per input. Desktop text limit: 10 MB and 150,000 lines. Comparisons run in a disposable worker with a 2.5-second diff algorithm budget and 12,000-edit distance bound. Diff rows preview up to 2,000 characters per line; the full text remains in Edit inputs and is used for merging. Only visible diff rows are mounted; unrelated UI interactions remain responsive. Very divergent files may require smaller sections. Text editors use plain text; file markup is never rendered as HTML. Textareas display LF; the shared text model preserves original line endings for output unless explicitly converted. Three-way text merge is a separate desktop workspace. Rich-document parsing and syntax-aware merge are not implemented.

Text Compare shows arrows beside each difference: → copies left to right and ← copies right to left. With no line selection, an arrow replaces the complete aligned section, including insertions/deletions. Command-click (Mac) or Ctrl-click (Windows) text lines or line numbers to select separate lines; Shift-click a line number to extend a range. An arrow then copies only those selected source lines into their aligned destination positions, preserving unselected destination lines. Clicking a text line or its line number selects that line; highlighting text selects the spanned lines. The copy arrow moves to the first selected line and replaces section arrows on that side. Its tooltip identifies the selected line or line count. Escape clears the line selection and restores section arrows. The whole copy is one Undo step. Cmd/Ctrl+Z undoes and Cmd/Ctrl+Shift+Z redoes comparison edits; Windows/Linux also support Ctrl+Y. When editing another text field, these keys use that field’s native history. Undo/redo retains bounded history per open tab for merge and text-tool edits (up to 30 states within a 20-million-character history budget, retaining the newest state). Direct typing uses native editor undo; typing or loading new inputs clears the comparison-action history. Save As writes only the file chosen in the native dialog.

DOCX files open as editable main-document text projections, with paragraph and table boundaries preserved. The source document stays unchanged: export edits as a separate text file. Version 2.214 also offers explicit re-extraction of referenced headers, footers and notes. Layout, formatting and embedded objects remain excluded. See [DOCX text comparison](docs/docx-text.md) for scope and limits.


## Folder operations

1. Choose two non-overlapping folders.
2. Expand folders inline; their immediate files compare automatically. Use masks and Differences filtering to focus the view.
3. Click to select entries; use Ctrl/Command for multiple selections or Shift for a range. Double-click a file to open a child comparison.
4. Review the exact operation plan, then confirm the native apply prompt.

**Compare pair** opens independently selected entries: select one on the left, Ctrl/Command-click one on the right, then use the button or the context/native menu action. Two files open using their actual paths; two folders open as separate comparison roots with the parent’s comparison rule. The original tab, roots and selections stay available.

**Text · preserve case and spaces** compares decoded text while ignoring encoding and line-ending styles. It preserves case, spaces/tabs, blank lines and the final newline. This mode is included in the 2.38.0 desktop archives.

**Text · ignore spaces/tabs** is an optional folder comparison method. It removes ASCII spaces/tabs and normalizes line-ending style, while retaining blank lines and the final newline. UTF-8 and BOM-marked UTF-16/UTF-32 up to 10 MiB use this rule; binary, unsupported or larger inputs use exact comparison. Green text matches are distinct from identical bytes, and reports count them separately. Copy/sync previews still compare actual bytes.

The right-click menu groups related actions into submenus. Use Right/Left arrows to enter and leave a submenu, Up/Down or Home/End to move, and Escape to return or dismiss. Common file actions remain at the top level. Navigate also provides Recent left folders and Recent right folders; choosing one replaces only that root in the current comparison. The Sort submenu offers size and modified-time sorting for either side; Reports offers snapshots of either root from either pane. Folder Merge and Folder Sync also provide **Direction → Left → Right / Right → Left** in the menu. This updates the toolbar direction; **Review merge/sync changes** previews that direction before any files change.

**Open as** choices in the grouped folder right-click menu and **Actions → Open As** let you choose text, binary, table, picture, audio, archive, or registry comparison independently of the filename extension. Select one file; a new comparison tab opens and retains a link to its parent folder tab. Double-click continues to choose the comparison type automatically. The chosen engine still requires a supported input format; this does not convert formats.

**Copy to Folder…** is available from the right-click and native Actions menus. Choose a destination, review the source/destination and operations, then apply. Selected entries keep their paths relative to the comparison root; selecting `src/config.json` copies to `destination/src/config.json`. The comparison roots stay unchanged. Existing files are backed up before replacement. Overlapping source/destination roots are rejected.

**Move** is available from the context and native Actions menus, in either direction or to a chosen folder. Review the full subtree preview before confirming. Source and overwritten destination backups are verified before moving; failures attempt guarded rollback without overwriting external changes. Recovery details and limitations are in the [2.26 release notes](docs/release-2.26.md).

**Merge** copies source-only files and replaces selected changed destination files, keeping destination extras. **Mirror sync** additionally removes selected destination-only entries. This is a deliberate, one-way operation, not an automatic background or bidirectional sync. Selecting all changes produces a full mirror for supported entries. File/folder type conflicts require manual resolution.

In any folder session, use **Synchronize → Mirror to left/right** from the right-click or native Actions menu to mirror selected files or folder subtrees without changing session type. Selected folders include collapsed descendants. Current file-action filters still apply; excluded entries and unselected siblings are preserved. Review the copy, overwrite and deletion preview before applying. Replaced or removed files use the existing backup and confirmation flow.

Ignored entries: `.git`, `node_modules`, `.DS_Store`, symlinks, and special files. Ignored content is preserved. Scans cap at 50,000 entries per side. The tree loads immediate children and compares files in expanded nodes. Expand all/subtree is cancellable and bounded to 5,000 directory reads and 50,000 entries. File masks filter the visible rows; collapsing or filtering a selected row clears its selection. Selecting a directory for copy/delete includes its supported descendants, so review the operation plan even when masks hide some children.

**Loaded files** flattens files from nodes already browsed in Tree view; it does not silently scan all descendants. Sort by name, path, either side’s size, or either side’s modification time, with ascending/descending order. View and sort options persist in saved sessions. Back to folder/archive returns to the open parent tab, retaining its browsing state. New File creates an empty file exclusively on the selected side and refuses an existing name.

Before execution, snapshots are verified again. Files are backed up before replacement/deletion, and copies use temporary files and atomic rename. Copy/delete/sync operations stop on errors; an interrupted multi-file operation is not automatically rolled back. Move uses the separate guarded rollback described above. The error reports progress and backup location. Backups contain `manifest.json` with destination paths and a `files/` directory preserving relative paths. Restore by reviewing the manifest and copying backed-up files to their original paths. Backups are retained until manually removed.

Backup locations:
- macOS: `~/Library/Application Support/Further Compare/backups` (Electron development may use the package name).
- Windows: `%APPDATA%/Further Compare/backups` (exact path appears after applying).

External processes can still modify a filesystem during an operation. Close writers before applying large folder plans. These are file-content workflows, not archival backups: extended attributes, ACLs, ownership, and timestamps are not promised to be preserved.

## Archive and registry files

Archive Compare opens stored or deflated ZIP/JAR (including ZIP64 records within the same size limits), USTAR, GNU TAR, PAX TAR and gzip-compressed TAR files in memory, with paired Name, Size, and Modified columns. Expanding a directory compares its immediate files and automatically follows sole child folders; unrelated collapsed descendants remain unexamined. Entry comparisons open in child tabs. Reports describe the examined-node scope. Explicit extraction and in-memory editing are available, with separate Save archive export to ZIP, TAR or TAR.GZ; source archives remain unchanged. Inputs are limited to 32 MB, 64 MB of expanded content, and 50,000 entries. Unsafe paths, symlinks, special entries, duplicates, encryption and multi-disk ZIP files are rejected. ZIP content reads verify CRC; TAR validates header checksums, and gzip validates its compressed stream. TAR modification times include UTC. ZIP modification times are displayed as stored wall-clock values, without assigning a timezone. ZIP exports use classic headers; original metadata and ZIP64 representation are not preserved.

Registry Compare reads exported `.reg` files, not the live operating-system registry. It supports Version 5/REGEDIT4 syntax in UTF-8 or UTF-16LE, up to 10 MB and 100,000 key/value entries. Keys and value names compare case-insensitively; strings, DWORDs, typed byte sequences, and deletion records are supported. Initialize a result from either input, copy selected keys/values, edit the result text, and export a validated UTF-16LE `.reg` file. Export does not apply registry changes.

## Additional workflows

- [Command-line comparisons and reports](docs/cli.md)
- [Version 2.5: editing tools, workbooks and snapshots](docs/release-2.5.md)
- [Version 2.6: appearance, expansion, audio and editing history](docs/release-2.6.md)
- [Version 2.7: archives, registry files, and folder navigation](docs/release-2.7.md)
- [Version 2.8: directory renaming and clipboard comparison](docs/release-2.8.md)
- [Version 2.9: text encodings, BOMs and line endings](docs/release-2.9.md)
- [Version 2.10: folder path navigation and history](docs/release-2.10.md)
- [Version 2.11: recursive file comparison](docs/release-2.11.md)
- [Version 2.12: folder comparison methods and tolerance](docs/release-2.12.md)
- [Version 2.54.0: encoded text in batch comparisons](docs/release-2.54.0.md)
- [Version 2.53.0: batch comparisons](docs/release-2.53.0.md)
- [Version 2.52.0: UTF-32 text support](docs/release-2.52.0.md)
- [Version 2.51.1: reliable lazy comparison scheduling](docs/release-2.51.1.md)
- [Version 2.51.0: adjustable folder columns](docs/release-2.51.0.md)
- [Version 2.50.1: folder selection and keyboard access](docs/release-2.50.1.md)
- [Version 2.50.0: TAR archives and colorful themes](docs/release-2.50.0.md)
- [Version 2.49.1: comparison-specific file pickers](docs/release-2.49.1.md)
- [Version 2.49.0: AIFF audio comparison](docs/release-2.49.md)
- [Version 2.48.1: remember collapsed folder differences](docs/release-2.48.1.md)
- [Version 2.48.0: parent folder difference colors](docs/release-2.48.md)
- [Version 2.47.0: pattern search and replacement](docs/release-2.47.md)
- [Version 2.46.0: folder filename navigation](docs/release-2.46.md)
- [Version 2.45.0: folder page navigation](docs/release-2.45.md)
- [Version 2.44.1: colorful light and dark themes](docs/release-2.44.1.md)
- [Version 2.44.0: worksheet display settings](docs/release-2.44.md)
- [Version 2.43.0: workbook panes and views](docs/release-2.43.md)
- [Version 2.42.2: tab closing during refresh](docs/release-2.42.2.md)
- [Version 2.42.1: tab navigation during refresh](docs/release-2.42.1.md)
- [Version 2.42.0: timestamp tolerance menus](docs/release-2.42.md)
- [Version 2.41.1: folder selection focus](docs/release-2.41.1.md)
- [Version 2.41.0: browser text Save As](docs/release-2.41.md)
- [Version 2.40.1: aligned folder exclusions](docs/release-2.40.1.md)
- [Version 2.40.0: Windows-1251 Cyrillic text](docs/release-2.40.md)
- [Version 2.39.1: Preserve folder path search](docs/release-2.39.1.md)
- [Version 2.39.0: Folder filter dialog](docs/release-2.39.md)
- [Version 2.38.1: Context-menu focus and selection fixes](docs/release-2.38.1.md)
- [Version 2.38.0: Decoded-text folder comparison](docs/release-2.38.md)
- [Version 2.37.2: Right-click folder pickers](docs/release-2.37.2.md)
- [Version 2.37.1: Native Open during background refresh](docs/release-2.37.1.md)
- [Version 2.37.0: Folder properties and colorful themes](docs/release-2.37.md)
- [Version 2.36.0: Workbook layout comparison](docs/release-2.36.md)
- [Version 2.35.0: Three-way folder merge and recovery](docs/release-2.35.md)
- [Version 2.34.0: Minor differences and inherited folder rules](docs/release-2.34.md)
- [Version 2.33.1: Folder navigation and context-menu corrections](docs/release-2.33.1.md)
- [Version 2.33.0: Folder alignment and colorful themes](docs/release-2.33.md)
- [Version 2.32.0: Workbook cell formatting comparison](docs/release-2.32.md)
- [Version 2.31.0: Workbook formula comparison](docs/release-2.31.md)
- [Version 2.30.0: Colorful themes and folder case rules](docs/release-2.30.md)
- [Version 2.29.0: Case-insensitive text comparison](docs/release-2.29.md)
- [Version 2.28.0: File-type editor profiles](docs/release-2.28.md)
- [Version 2.27.0: Advanced external-editor commands and gap context menus](docs/release-2.27.md)
- [Version 2.26.0: Folder moves and richer themes](docs/release-2.26.md)
- [Version 2.25.0: Binary range editing and redo](docs/release-2.25.md)
- [Version 2.24.0: Copy binary differences](docs/release-2.24.md)
- [Version 2.23.1: Precise binary difference navigation](docs/release-2.23.1.md)
- [Version 2.23.0: Binary insertion alignment](docs/release-2.23.md)
- [Version 2.22.1: Warmer, more colorful light and dark themes](docs/release-2.22.1.md)
- [Version 2.22.0: Compare selected file and folder pairs](docs/release-2.22.md)
- [Version 2.21.0: Folder text comparison rules](docs/release-2.21.md)
- [Version 2.20.1: Compact folder context menus](docs/release-2.20.1.md)
- [Version 2.20.0: Explicit folder comparison types](docs/release-2.20.md)
- [Version 2.19.0: Copy to Folder](docs/release-2.19.md)
- [Version 2.18.1: Windows native timestamp helper](docs/release-2.18.1.md)
- [Version 2.18: selected-entry modified time](docs/release-2.18.md)
- [Version 2.17.3: stable folder color updates](docs/release-2.17.3.md)
- [Version 2.17.2: reliable folder activation and keyboard navigation](docs/release-2.17.2.md)
- [Version 2.17.1: reliable folder menu commands](docs/release-2.17.1.md)
- [Version 2.17: external editor integration](docs/release-2.17.md)
- [Version 2.16.1: folder selection fixes](docs/release-2.16.1.md)
- [Version 2.16: Prism and Aurora themes](docs/release-2.16.md)
- [Version 2.15: file manager comparison workflow](docs/release-2.15.md)
- [Version 2.14: manual text alignment](docs/release-2.14.md)
- [Version 2.13: folder reports and statistics](docs/release-2.13.md)

The full-product feature request remains in progress. `implementation-plan.json` records implemented capabilities and outstanding work, including remote sources, archive writing and additional formats, live registry operations, and advanced editing. Windows packages are cross-built on macOS; Windows runtime verification requires the configured Windows CI runner or another Windows host.

## Desktop downloads

```sh
npm run pack:mac       # ZIP apps for Apple Silicon and Intel
npm run pack:win       # Portable Windows x64 ZIP
npm run downloads      # Copy built packages and generate SHA-256 manifest
npm run build          # Build site with working download links
```

Build output is `release/`. The product page enables downloads only when an actual package entry exists in `public/downloads/manifest.json`. Missing downloads remain marked as preparing. Never add placeholder URLs.

Mac ZIP: extract and move Further Compare.app into Applications. Windows ZIP: extract the entire folder and run Further Compare.exe. These preview builds are unsigned; macOS Gatekeeper/Windows reputation checks may require explicit approval. Distribution for a public launch should use your Apple signing/notarization credentials and Windows signing identity. No signing credentials are included.

`.github/workflows/desktop.yml` builds and tests natively on macOS and Windows when this source is placed in a GitHub repository. GitHub/Electron download access is required for packaging. Native Windows runtime testing must pass before claiming Windows verification; a cross-built ZIP alone does not prove it.

## Source layout

- `index.html`, `public/landing.*`: product site and real download manifest integration.
- `compare.html`, `style.css`, `src/app.js`: shared browser/desktop interface.
- `src/diff.cjs`, `src/worker.js`: line diff, aligned merges, background comparison.
- `desktop/main.cjs`, `desktop/preload.cjs`: sandboxed Electron window and narrow, validated IPC.
- `desktop/folders.cjs`: native folder scanning, planning, backups and execution.
- `src/archive-core.cjs`, `src/archive-compare.js`: bounded read-only ZIP/JAR/TAR/TAR.GZ parsing and browsing; `src/tar-core.cjs` handles TAR records.
- `src/registry.cjs`, `src/registry-compare.js`: exported registry parsing, comparison, and result editing.
- `test/`: meaningful engine, filesystem and UI regression tests.

The desktop bridge has no arbitrary filesystem API. Folder roots come from native dialogs, paths are checked, IPC callers are validated, navigation/popups are blocked, and Node.js is isolated from the renderer.

## Verification performed

Version-specific test counts and package verification are recorded in the release notes. Chrome regression suites cover the browser workspace, text tools, appearance, images, workbooks, audio, archives, and registry files. Native Electron suites cover desktop sessions and filesystem operations, advanced comparisons, folder navigation, editing history, appearance, archives, and registry exports.

Apple Silicon and Intel Mac packages have launch-smoke coverage on this Mac (Intel through compatibility execution). Windows is cross-built; native Windows runtime tests are configured in CI but have not been executed here. The builds remain unsigned previews. See the release notes for capability limits.


## Session interface (v2.1)

The comparison app uses Session, File, Edit and View menus without a sidebar. Choose Text Compare, Text Merge, Folder Compare, Folder Merge or Folder Sync from the Session menu or type selector. The browser supports Text Compare sessions; other types run in the desktop app.

Use the folder buttons beside **Left** and **Right** to open files or directories. Desktop displays the full filesystem paths; the browser displays filenames because browsers do not expose native paths. Hover over a path to see it in full. Save icons open native Save As dialogs on desktop and download the selected pane in the browser, preserving its output encoding, BOM and line endings. Browser downloads use the original filename or left.txt/right.txt; they do not clear unsaved session changes.

**Save Session / Save Session As** writes a `.fcompare` JSON file containing the session name/type, text snapshots (including unsaved text edits), authorized paths, whitespace option, display filter and transfer direction. **Open Session** restores them; folder sessions rescan current contents. Native session saves replace the old file atomically. Session files contain your compared text and local paths: store them as you would the source files. Opening a native session requires its saved file/folder paths to exist. Browser sessions download/upload `.fcompare` files; reload from original native paths is desktop-only.

**All** shows every line; **Diff** only changed lines; **Same** only matching lines; **Context** shows differences with three neighboring lines and collapsed gaps. Folder Context retains changed entries and their parent directories. Filtering never changes merge coordinates. Section copy arrows apply the selected text change in Text Merge, or review selected transfers in Folder Merge/Sync. Swap exchanges both content and associated paths. Reload reads selected files again from disk; unsaved sessions prompt Save / Discard / Cancel first. New/Close Session also protects unsaved snapshots.

Keyboard shortcuts: Cmd/Ctrl+O opens a session; Cmd/Ctrl+S saves it; Cmd/Ctrl+Shift+S saves as; Cmd/Ctrl+Alt+O opens the left file; add Shift for the right file. Cmd/Ctrl+Enter compares. Native menus include section copy and previous/next navigation.

### v2.1.1 startup correction

The macOS activation listener is registered after Electron readiness and initialization, preventing Finder/Dock launches from creating a BrowserWindow too early. A regression test covers early and repeated activation and window reopening. All 32 tests pass. Both packaged Mac architectures passed actual macOS LaunchServices startup and comparison smoke checks (Intel under Rosetta on Apple Silicon). Quit an older running instance before reopening the updated app.

## Session browser (v2.2)

The app starts with Text Compare, Text Merge, Folder Compare, Folder Merge, and Folder Sync choices. Each choice opens a separate tab; the macOS app uses its native menus without repeating them inside the window. Text changes compare automatically after a short debounce. Open disk files refresh while the app is active, while locally edited text is preserved with a reload notice.

Folder sessions show aligned left and right panes with status colors and striped missing counterparts. Disclosure controls expand directories inline. Click files to select; use Ctrl/Command or Shift for multiple selection and double-click to open a child comparison. Browsing compares immediate files in expanded nodes and leaves unopened descendants unchecked. Copy and delete actions use the current selection, with preview, native confirmation and backups.

## Interface update (v2.3)

The desktop apps have an illustrated session chooser with colored icons; the webpage starts directly in Text Compare. A single click expands or collapses folders inline in the paired trees, keeping parent folders and siblings visible. Expanded branches stay open when returning from a text tab. Collapse all returns to the root-level tree. Only expanded directories are listed.

Text comparison keeps each side at half the window width regardless of line length. Each pane scrolls horizontally independently; vertical scrolling stays synchronized. Toolbar icons include short action labels. These shared interface changes ship in both macOS architectures and Windows x64.

## Comparison workspace (v2.4)

Folder rows use a compact name/size/modified layout. Click to select, Command/Ctrl-click to toggle selections, Shift-click for a range, and double-click files to compare. Disclosure controls expand folders inline. Right-click and native Actions menus expose copy, delete, file/folder rename, new folder, reveal, clipboard paths, selection, filters and refresh. Replaced/deleted files retain the existing preview, confirmation and backup flow.

Direct files in the root and expanded nodes compare in the background. Size differences short-circuit; equal-size files use SHA-256 with bounded concurrency and a revision cache. Unexpanded descendants are not hashed. Color distinguishes identical, changed, one-sided and pending entries. File and directory rename refuse existing destinations. Directory renaming uses a platform helper; macOS is verified locally and Windows runtime verification remains pending. Use F2 or the context menu to rename one selected entry.

Desktop sessions include binary, table, three-way text merge, picture, WAV/AIFF/FLAC/MP3 audio, exported registry and ZIP/JAR comparisons. Binary comparison aligns insertions and supports byte/range editing with undo/redo. Tables support CSV/TSV and XLSX sheets, plus cached-value ODS/XLS/XLSB input, keyed row matching, editable values, and CSV or values-only XLSX export. Binary workbook input profiles and limitations are documented in [XLS/XLSB input](docs/legacy-workbook-input.md). Supported rows are paginated in groups of 100. XLSX inputs can compare cached values or exact formula expressions; shared formulas resolve to each cell's expression. Keys always use cached values. Optional Compare formatting includes stored number formats, fonts, fills, borders, alignment, protection and rich text, with expandable per-side property details. Theme color references resolve against each workbook’s palette, so identical indices with different colors compare differently; equivalent palette entries and explicit RGB colors compare equally. Tint parameters are preserved, rather than comparing rendered pixels. Optional Compare layout shows merged ranges, row heights, column widths, hidden states, outline levels, default dimensions, frozen/split panes, gridlines, row/column headings, formula/zero display, ruler, outline symbols, page whitespace, reading direction, zoom and view mode in a separate paginated panel. Layout uses physical worksheet coordinates independently of keyed value matching. Pane and view comparison is included from version 2.43.0. Formula recalculation, theme rendering, conditional formatting and additional page/view/print properties remain unsupported.

Advanced native inputs are capped at 32 MB and saved sessions at 25 MB. Workbook expansion is capped at 64 MiB, 64 sheets, 500,000 cells, 50,000 rows per sheet and 512 columns. Remote sources, additional archive formats and editing, live registry access, additional compressed audio formats and broader scripting remain incomplete. The implementation ledger tracks the remaining scope.

The source build includes three-way folder merging: choose base, left and right folders, resolve conflicts, then review changes to a separate output folder before applying. A native confirmation identifies the target. Affected output files are backed up before writes. Recovery records can be inspected from any three-way folder tab, including one with no inputs selected. Restoring a reviewed record requires confirmation, rejects changed output, and creates another recovery record for the pre-restore output. Interrupted operations stop and retain their backups; they do not automatically roll back. These additions are included in the 2.35.0 download archives. Windows runtime verification remains pending.

Recovery currently restores file contents and tree structure, but not directory permissions or timestamps. Exclusive file publication requires hardlink support; a failure retains the recovery backups. For crashes during a temporary-file write, recovery requires the recorded file identity and bytes matching the verified staged-source prefix. Unrecognized or altered temporary files are refused. Handled write errors clean up their verified temporary file.

### File action history

Folder comparisons expose **File action history** in the right-click Reports submenu and native menu. By default, history remains in the current window. Enable **Keep history between app runs** to save the latest 100 attempts on this computer, including paths, outcomes and backup locations. Enabling retains current entries; disabling removes the saved history while keeping current-window entries available. Clear history removes the entries without deleting files or backups. JSON export remains available.

### Text encoding and line endings

Folder text comparison supports a shared encoding plus separate left/right overrides in **Filters & options → Text encoding** (also available from right-click and the native menu). Each side can inherit the shared setting or explicitly use Auto. Choices are saved with the session, follow their roots when swapped, and carry into child text comparisons and reports. Different source encodings can compare equal after decoding; identical bytes decoded as different text can compare unequal. Content mode still compares exact bytes.

Each text side exposes output encoding, BOM, and LF/CRLF/CR controls. UTF-8, UTF-16 and UTF-32 BOMs are detected automatically; choose Read as for BOMless UTF-16/UTF-32, Windows-1250 through Windows-1258, or Latin-1. Raw text preserves unchanged mixed endings despite textarea normalization. Conversion participates in undo/redo and saved sessions. Unsupported output characters fail without replacing the target file. See the version 2.9 notes for editing and format limits.

Version 2.37.0 includes **Properties → View properties…** in folder right-click menus and **Actions → View Properties…** in the native menu. It shows selected paths, exact file-byte totals, local/UTC timestamps and available POSIX mode/owner information, with 25-entry pages for up to 1,000 selected entries. Folder contents are not scanned for totals. The viewer is read-only and is included in the 2.37.0 archives.

Version 2.37.2 adds **Navigate → Choose left folder… / Choose right folder…** to folder context menus, including empty-pane right-clicks. These commands use the native folder picker and preserve the other side. They are included in the 2.37.2 archives.

Version 2.39.0 adds **View → Edit filename filters…** to folder right-click menus and **View → Folder Filename Filters…** to the native menu. Include/exclude patterns and path search share the toolbar state. Reset edits the draft; Apply updates the tree. Cancel or Escape preserves the current filters. This dialog is included in the 2.39.0 archives.

Version 2.39.1 preserves folder path search with include/exclude filters across tabs and saved sessions. Direct toolbar search edits mark the session as changed. Old sessions open with an empty search. This fix is included in the 2.39.1 archives.

Version 2.40.0 adds explicit **Windows-1251 (Cyrillic)** input and native output alongside existing encodings. Auto remains UTF-8/BOM based. Undefined byte `0x98` and unrepresentable output characters are rejected. Mapping follows the [Unicode CP1251 table](https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/CP1251.TXT). Browser import/comparison and native byte-exact saves were verified; included in the 2.40.0 archives.

Version 2.50.1 adds **Matching files (current rules)** to the folder selection dropdown, **Selection → Select matching files** to right-click menus, and **Actions → Select by → Matching Files (Current Rules)** to the native menu. It selects visible paired files with completed matching results under the active comparison method; directories and pending comparisons are excluded. This addition is included in the 2.50.1 download packages.

Version 2.50.1 also keeps both folder panes in the keyboard Tab order, including empty panes. Shift+F10 opens the focused pane’s context menu. Focusing a row does not select or open it. This fix is included in the 2.50.1 downloads.

Version 2.51.0 supports linked folder column widths. Drag a column boundary in either pane to resize both sides. Focus a boundary and use Left/Right arrows (Shift for larger steps); Home or double-click resets that column. Escape cancels an active drag. Width preferences persist on the device and fit the current window. This feature is included in the 2.51.0 downloads.

To reset both folder columns together, use **View → Reset column widths** in the folder context menu or **View → Folder Layout → Reset Column Widths** in the native menu. Both packaged Mac architectures passed the real-folder resize and reset workflow in 2.51.0; Windows runtime verification remains pending.

Version 2.51.1 retains folder-comparison requests made while an earlier pass is running and rechecks the current tree afterwards. Nodes collapsed before their turn are skipped. A native delayed-comparison regression and the parent-color workflow pass; this fix is included in the 2.51.1 downloads.

Version 2.52.0 supports UTF-32 LE and BE text input/output, including BOM autodetection and explicitly selected BOMless input. Invalid scalars and incomplete four-byte units are rejected. Browser downloads and native saves preserve bytes, and sessions preserve format settings. This feature is included in the 2.52.0 downloads.

The source CLI now supports JSON comparison batches with a no-write dry run, complete plan validation, independent job results and exclusive report creation. See [batch comparison scripts](docs/cli.md#batch-comparison-scripts). Version 2.53.0 also provides File → Batch Comparisons… for no-write review and confirmed execution.

Version 2.54.0 shares the editor decoder with text CLI and batch jobs. BOM detection covers UTF-8/16/32; per-side encoding choices support BOMless Unicode and Windows-1251/1252 or Latin-1. Batch review displays encoding choices, and text reports include detected source formats. Text jobs share the editor’s 10 MB limit; binary/table jobs retain 32 MB.

Version 2.55.0 adds **Calculate folder size** to folder entries in Properties. It recursively sums file byte lengths from metadata on demand, without hashing contents or expanding the comparison tree. Links and special entries are skipped; skipped entries or scan limits are marked Partial. Each scan is bounded to 50,000 entries with a 10-second budget checked between entries. Disk allocation and hard-link deduplication are not measured.

Version 2.55.1 cancels pending folder-size traversal when Properties closes. Cancellation takes effect after any current filesystem call returns. Scan requests are scoped to that Properties selection; closing or replacing it invalidates the request.

Version 2.56.0 adds **Save left file as… / Save right file as…** to Archive Compare’s toolbar and right-click menu. Select an archive file and choose a destination for its exact bytes (up to 32 MB). Saving one entry does not extract its folder hierarchy or repack the archive. Supported ZIP/JAR/TAR/TAR.GZ inputs share this workflow.

Windows-1250 and Windows-1253 through Windows-1258 are available for explicit text input/output, folder text rules and folder patches. Undefined bytes and characters outside the chosen code page are rejected rather than replaced. Auto detection remains Unicode BOM/UTF-8 based. Windows-1258 preserves combining sequences exactly; it does not automatically normalize precomposed Vietnamese characters for encoding.

FLAC audio loading verifies a nonzero STREAMINFO MD5 against the reconstructed original PCM samples. Files without a stored MD5 remain supported and are labeled accordingly. A mismatch rejects the new input while retaining the previous comparison. Audio reports record `streamMd5` as `verified` or `unavailable`; this reports stream MD5 only, not independent verification of every frame CRC.

Folder **Filters & options → Comparison** can additionally compare Unix permission bits, numeric owner IDs and numeric group IDs. The same controls are available from right-click **Compare → Metadata options…** and the native **View → Folder Comparison → Unix Metadata…** menu. These checks are off by default, apply to files and folders in opened nodes, and are saved with the comparison. Metadata-only differences retain the underlying file-comparison result in tooltips and reports. The checks do not modify attributes or ownership; ACLs and extended attributes are not compared. Unix metadata comparison is unavailable on Windows, where enabled rules are explicitly rejected.

Folder **Filters & options → Tree & display → Automatic refresh** selects Off, 1.5 seconds, 5 seconds, 15 seconds, 30 seconds, 1 minute or 5 minutes. The setting is retained in sessions and reusable defaults. Refresh checks the root and opened nodes, pauses during dialogs and operations, and waits a full interval after each scan finishes. Recursive and filename views use manual refresh. Right-click View and the native Folder Comparison menu expose the same setting.

Folder **Filters & options → Comparison rules** offers **Ignore one-hour differences** and **Ignore whole-hour differences** for Modified Time and Size + Modified Time methods. Both default to off. Timestamp tolerance applies around each allowed difference; size still matters in Size + Modified Time mode. These preferences classify timestamps without modifying files, changing displayed dates, or changing newer-file direction. Sessions, reusable defaults and reports retain the choices.

Exact-path folder trees retain each side’s actual filename spelling. Case or Unicode spelling aliases accepted by the operating system do not create implicit pairs. Select the actual left and right entries and use **Align selected pair** to compare differently spelled paths.

Folder **Filters & options → Pairing & alignment** can automatically pair unique names while ignoring letter case or matching equivalent Unicode spellings. Exact names and manual alignments take priority; ambiguous names stay separate. These opt-in rules also apply to unopened descendants during file-action previews, while browsing remains limited to opened nodes. Original names are retained, and computed pairs are not saved as manual alignments. Policies persist in sessions, workspaces, defaults and reports.

Pairing options also include **Match files with different extensions**: unique remaining file stems pair after full-name matches. Only the final extension is ignored; folders and ambiguous stems stay separate.

Enable **Comparison rules → Compare filename spelling** to flag actual basename differences on already paired files and folders, including case, Unicode spelling and extension. Reports distinguish name differences from content differences. Parent-path spelling alone does not flag a child, and the option does not rename entries. The criterion also controls filtered operation eligibility for unopened descendants.

Selective whitespace rules are shared by text and normalized folder comparisons: leading, trailing, embedded spaces/tabs and their combinations. They preserve original bytes and meaningful line boundaries. CLI text jobs accept `--ignore-whitespace --whitespace-scope leading` (also `trailing`, `edges`, `embedded`, `leading-embedded`, `trailing-embedded`, `horizontal`, `all`); batch JSON uses `ignoreWhitespace: true` and `whitespaceScope`.

Optional **Ignore blank lines** treats empty and spaces/tabs-only lines as minor differences in text and normalized folder comparisons. Final newlines after nonblank text remain significant, and manual alignment takes precedence. Merges retain internal blank lines; removing a final newline can remove empty trailing separators. CLI: `--ignore-blank-lines`; batch JSON: `ignoreBlankLines: true`.

MP3 comparison supports standard MPEG-1/2/2.5 Layer III mono/stereo streams, including variable bitrate, within the audio size/sample limits. It compares decoded floating-point samples at the original sample rate; MP3 is lossy, so this does not establish original-recording or compressed-byte equality. Decoder delay and padding can affect alignment. Free-format and mixed-layout streams are not supported.

Version 2.165.0 adds reviewed deletion of one regular SFTP file from the folder context menu, side toolbar and native Delete action. A verified local recovery copy precedes deletion. Unknown outcomes are shown explicitly and never retried automatically; open child editors preserve unsaved text and lose the obsolete server-save permission. Remote directories and multi-file deletion remain unavailable. See [release details](docs/release-2.165.0.md).

Typed workbook edits and ordinary formula-preserving selective copy are available in 2.189. See [typed workbook editing](docs/workbook-typed-edits.md) for source preservation, recalculation and structural-edit limits.

Selected base-cell formatting copy is available in 2.190. See [workbook formatting copy](docs/workbook-formatting-copy.md) for preserved content and supported formatting.

PDF files open as editable text projections with page boundaries. Export edits as a separate text file; original PDFs and archive entries stay unchanged. Scanned PDFs without a text layer and password-protected PDFs are rejected. See [PDF text comparison](docs/pdf-text.md) for scope and limits.
