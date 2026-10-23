# Live folder menu audit — 21 October 2026

After the user unlocked the Mac, the installed reference application was inspected through its native accessibility menu tree. Actions, View, Edit and Search menus were opened and read; no file operation or preference was applied. The final menu was dismissed. Window screenshot capture was unavailable, so this is menu-inventory evidence, not visual or behavioral verification of every command.

## Observed gaps to investigate and implement

- View: paired-only entries, changed paired entries, either-side-only entries, left/right newer, newer combined with same-side-only entries, temporary filter suppression, explicit always-show-folders, structure-independent matching, ignored/unimportant differences, legend and operation log.
- Actions: quick comparison, explicit selected-file content comparison, selected-entry refresh, ignored-entry state, file comparison reports from folder selections, attributes, and update-both synchronization. Existing copy/move/touch/alignment/exclude operations need behavior-level comparison; similar names do not establish parity.
- Edit: select all files separately from folders, newer selection on both sides, one-sided selection on both sides, and full-refresh versus refresh semantics.
- Search: filename find dialog, next filename match and previous filename match. Current path filtering and typeahead do not establish equivalent search behavior.

## Existing corresponding workflows

Open and Open as; independent pair comparison and alignment; copy/move/delete/rename; modified-time editing; exclusion; new folder; path copying; expansion/collapse; select/invert; difference navigation; and left-only/right-only display filters have corresponding implementation paths. Their presence is not a claim of complete reference parity.

The broader product scope, other session types, remote connections and Windows runtime remain open. Session and Tools menus were subsequently inspected through the same native accessibility interface, then dismissed. Remaining observed Session gaps include saved multi-tab workspaces, new/multiple windows, close-other-tabs, session locking, and combined parent navigation. Tools exposes settings export/import/reset and standalone text/patch workflows. Actual interactions on disposable comparison fixtures still require verification.

## Implemented since this inventory

Release 2.65.0 adds file-only and both-pane newer/one-sided selection commands. Release 2.66.0 adds paired, changed-pair, either-side-only, newer and newer-plus-one-sided display filters. These have dedicated runtime regressions; temporary filter suppression, always-show-folder policy and other listed gaps remain open.

## Filename search inspection and 2.67.0

After the machine was unlocked, the live Search > Find Filename dialog was inspected through accessibility and a screenshot. It exposed text, case, whole-word and regular-expression matching; wrap and upward search; left/right sides; and Select All. The dialog was cancelled without modifying reference files. Further Compare now exposes these controls plus next/previous commands. Its scope is explicitly the visible tree; identical reference behavior for collapsed descendants has not been established.

## Temporary filter suppression and 2.68.0

The live View menu was re-inspected and dismissed without changing reference settings. The vendor's [Filtering the Folder Compare View](https://www.scootersoftware.com/v5help/dir_filtering_the_view.html) documentation describes temporary file/display filter suppression with revealed entries marked teal. Further Compare now provides Show hidden / Restore filters with per-tab temporary state, markers, normal row actions and effective report scope. Recursive operation filtering remains a separate parity gap; existing previews describe their full subtree scope.

## Recursive file actions in 2.69.0

Recursive copy, move and delete now use the current filename/search/status filters and comparison rules, including original aligned endpoints and external destinations. An explicit all-contents override is available from the file-action selector and right-click menu. Both packaged Mac architectures passed actual filesystem regressions. Windows runtime testing remains open.

## Selected-file comparison in 2.69.1

The native Actions menu and folder right-click menu now provide Compare Selected Files. It refreshes only selected file rows in place under current comparison rules; paired files are read, one-sided rows retain their status, and unselected siblings and closed nodes remain untouched. Backend tests validate selected-only reads, aligned identities, metadata edits and stale-result rejection. Desktop tests verify both menu routes, selection/focus retention and no extra tabs. This addresses the selected-file comparison inventory gap; it does not establish every reference action's behavior.

## Explicit folder visibility in 2.70.0

A saved Always show folders preference now keeps paired and one-sided directories visible across status filters. Explicit exclusions and path queries remain active. Toolbar, right-click View and native View routes share this per-comparison setting. The desktop regression verifies no extra folder reads, no unrelated file exposure, tab isolation and saved-session restoration. Reports record the preference. This addresses the always-show control; other folder-display modes and structure-independent matching remain open.

## Closing other sessions in 2.71.0

Session > Close Other Sessions and tab right-click now keep the chosen comparison and close other tabs through existing unsaved-change guards. The new desktop/browser regressions verify Cancel stops the batch, Save precedes closure, and retained contents survive. Desktop testing also verifies a request queued behind an active operation. This addresses the close-other-tabs gap; saved workspaces, multiple windows, session locking and other listed gaps remain open.

## Folder context session and tools access in 2.72.0

The folder context now exposes session open/save/save-as/close/close-others, batch comparisons, file manager integration and external-editor settings inside Session & tools. Compare selected pair moved into Compare to retain the compact root limit in compare, merge and sync modes. Existing action dispatch preserves session guards. Opening a session and cancelling now removes the provisional tab and returns to the prior comparison. Runtime checks cover actual dialog routes, session saving, cancellation, pair comparisons and menu layout. This improves access to implemented commands; it does not close the remaining product feature gaps.

## New comparisons and consistent sorting in 2.72.1

All supported new session types are now accessible through the folder context's Session & tools submenu. Creating them keeps the parent comparison, roots, selection and unsaved state. Context sort selection now matches native-menu ascending behavior; Reverse sort is explicit. Tests exercise every new-session route and repeated sort commands. Remaining feature gaps above are still open.

## Color legend visibility in 2.73.0

Right-click View and native View now expose a per-comparison color legend visibility setting. It survives saved sessions and is independent across tabs. Runtime evidence shows no folder reads, comparison changes or row replacement when toggling. This addresses the legend control gap; operation logging and the other remaining view workflows are still open.

## File-action history in 2.74.0

Folder context Reports and native View now expose bounded in-memory history for copy/move/delete/merge/sync execution attempts, including distinct completed/cancelled/failed outcomes, captured roots, filters, paths and backup location. History can be exported as JSON or cleared. Real filesystem regression covers completion, native cancellation and a stale-plan rejection. This supplies an operation-history workflow; rename, timestamp and three-way-output logging and durable history remain separate gaps.

## Quick comparison in 2.76.0

The live Actions > Quick Compare command was inspected on the installed reference app. It showed a compact result sheet for the selected file pair, with Close and Open View actions. The sheet was dismissed without changing files. Further Compare now provides Quick comparison from the folder context Compare submenu and native Actions menu. It uses current comparison rules and the selected-file native operation, presents both paths and the result without creating a tab, and opens the existing full comparison on explicit request. Metadata-only checks are clearly identified. One-sided, directory and multi-file selections are unavailable for this command. This observation establishes the compact-result workflow, not parity for every file type or quick comparison policy.

## Clipboard filename/path modes in 2.76.1

The observed Copy Filename menu item prompted explicit clipboard variants. Further Compare exposes Copy filenames, Copy relative paths and Copy paths in its folder context and native menus. Native IDs and aligned side-specific endpoints remain authoritative. The precise reference clipboard formatting behavior was not inspected; these commands are explicit product semantics, not a claim of identical formatting.

## Mixed-selection refresh in 2.78.0

The live reference Actions menu exposes Refresh Selection. Further Compare now exposes Refresh selected in its context and native menus, comparing immediate selected folder nodes and exact selected files with no unrelated scans. Selected folders show one level inline. Tests cover mixed selection, parent-first deletion, overlap, unchanged unrelated branches and preserved focus. This inspection establishes the reference command's presence, not identical refresh semantics. Standalone deleted/replaced file recovery still requires a parent refresh.

## Selected-file refresh recovery in 2.78.1

The standalone deleted/replaced file limitation above is now addressed by a distinct native refresh operation. It rereads only registered selected endpoints, updates newly appeared counterparts and type conflicts, and removes both-missing pairs. Strict comparison and file-action validation remain separate. Unit and desktop regressions cover identity changes, absence revalidation, unrelated-node isolation and stale request rejection. Folder identity changes still require refreshing their parent.

## Folder identity and conflict recovery in 2.78.2

Refresh selected now rechecks selected directory identities before reading their immediate contents, removing stale descendant rows when folders are deleted, replaced or become files. Conflict rows can recover through the same command once their endpoints have compatible types again. Unchanged selected directories retain loaded descendants. This addresses the remaining folder identity limitation above; root replacement still requires choosing roots again.

## Selected results reports in 2.79.0

Folder reports now offer selected rows as an explicit scope, reachable through context and native menus. Both panes contribute selected logical pairs once; directory selection does not recursively add children. Snapshot isolation and all four formats are covered by desktop tests. This improves report access for folder selections; the observed File Compare Report action's detailed file-content report behavior is not implemented or claimed by this change.

## File-type exclusion in 2.81.0

The installed reference Actions menu was re-inspected; it exposes Exclude. The vendor's https://www.scootersoftware.com/v5help/opexclude.html describes an offered type-wide exclusion for selected files of the same type. Further Compare now adds an explicit Exclude file types dialog beside exact-path exclusion, supporting one or multiple selected extensions. It previews standard filename masks and discloses that matching folders and descendants are hidden too. This closes the missing convenient extension-exclusion workflow, not the remaining full-product gaps.

## Temporary ignored entries in 2.82.0

The observed Actions > Ignored entry and the vendor's https://www.scootersoftware.com/v5help/commandsdir.html describe suppressing selected differences. Further Compare now supports temporary per-tab ignored review marks with explicit restoration. Actual comparison results remain intact, reports retain both ignored and actual statuses, and explicit file operations keep their existing semantics. This establishes the suppression/review workflow; exact reference persistence and every interaction with file actions were not independently established.

## Paired parent navigation in 2.84.0

The observed combined parent-navigation gap now has a corresponding workflow in context Navigate and native View > Folder Navigation. Both parent roots are validated together, preserving independent histories and the current tab. Overlapping destinations reject the whole change. This closes the combined-parent command gap; saved workspaces, multiple windows and session locking remain open.

## Saved workspaces in 2.85.0

Saved multi-tab workspaces now have Session menu and folder-context routes. The bounded workspace format includes supported session snapshots, tab order and active index; opening appends validated tabs without replacing current work. Native window layouts, startup restoration and multiwindow behavior remain distinct gaps.

## Clear Session in 2.86.0

The live Session menu was re-inspected and showed Clear Session alongside Locked, workspace and navigation commands; the menu was dismissed through its Cancel action. The vendor [text commands documentation](https://www.scootersoftware.com/v5help/commandstext.html) describes replacement by an empty comparison of the same type. Further Compare now offers a guarded clear action in native, folder and tab context menus, preserving tab identity and using Save/Discard/Cancel for unsaved work. Session locking remains unimplemented; the vendor [session management documentation](https://www.scootersoftware.com/v5help/managing_sessions.html) identifies protection of named sessions, which is not equivalent to making files read-only.

## Parent-folder comparisons in 2.87.0

The observed Compare Parent Folders command now has a corresponding native, tab-context and folder-context route. It creates a fresh two-sided folder comparison from native-authorized disk inputs while retaining the source tab. Text and binary workflows have runtime evidence. Embedded-only inputs and three-way folder reviews remain unsupported; existing root-overlap restrictions also apply.

## Bidirectional update in 2.88.0

The vendor [Folder Compare commands](https://www.scootersoftware.com/v5help/commandsdir.html) and [Folder Sync workflow](https://www.scootersoftware.com/v5help/dir_sync_how_to_sync.html) describe copying newer and orphan items in both directions. Further Compare now provides a selected-entry Update both sides command in context and native Synchronize menus. It previews actual directions, respects filters, retains ambiguous pairs for manual review and preserves timestamps. Folder Sync mode-selector integration and directional update variants remain open; the existing Review changes control still means directional mirror sync.

## Directional updates and saved sync methods in 2.89.0

Context and native Synchronize menus now include Update left/right. Folder Sync offers Mirror, Update newer files and Update both sides; methods persist through tab switching and saved-session reopening. Legacy sessions default to Mirror. Directional updates preserve newer targets and target-only entries. Source regressions, 66 related filesystem tests, 30 session tests, 8 workspace tests and both Mac package workflows passed. Windows package contents and downloads verified; Windows runtime and full product parity remain incomplete.

## Saved-session protection in 2.90.0

The vendor's [Managing Sessions](https://www.scootersoftware.com/v5help/managing_sessions.html) and [Text Compare Commands](https://www.scootersoftware.com/v5help/commandstext.html) describe locking named sessions against accidental modification. Further Compare now provides saved-session lock/unlock through native Session, folder and tab context menus, and a compact saved-session control. Locks protect the session definition rather than compared files. Save on a locked definition creates a separate unlocked copy; the native boundary rejects overwriting locked definitions. Toggling the lock preserves unsaved renderer edits and all original saved payload fields. Detached workspace entries do not acquire authority to the original session path. Source UI and 52 related tests passed; final package evidence is in release-2.90.0.md. Multiwindow, settings transfer, remote providers and other listed product gaps remain open.

## Structure-independent matching in 2.91.0

The vendor's [Folder Compare commands](https://www.scootersoftware.com/v5help/commandsdir.html) and [folder filtering](https://www.scootersoftware.com/v5help/dir_filtering_the_view.html) describe hiding the tree and aligning filenames across subfolders. The [duplicate-name explanation](https://forum.scootersoftware.com/forum/beyond-compare-discussion/general-aa/93829-understanding-ignore-folder-structure-mode) confirms one-to-one pairing can leave duplicate-name orphans. Further Compare now offers Match filenames across folders with explicit deterministic path-priority/ordinal pairing and actual paths displayed. It preserves manual mappings, uses native registered rows for actions, saves only the mode and manual alignments, and cancels staged matching without partial publication. Whole-operation directory scaffolding is handled separately from file candidates. Source UI, 167 related tests and an additional operation-regression group passed; final package evidence is recorded in release-2.91.0.md. Windows runtime and remaining product scope stay open.

## Sync method context parity (2.91.1)

A current-state review found that Folder Sync exposed its saved method only through the toolbar selector. Right-click Synchronize now includes a Sync method submenu for all three existing modes. Bidirectional mode disables context Direction options consistently with the toolbar. Source and both Mac package tests verify menu changes, previews, tab persistence and saved-session reopening. This closes the identified right-click omission; broader product scope and Windows runtime remain open.

## Three-way folder reporting (2.92.0)

The explicit three-way Export Report placeholder is replaced by a full-analysis frozen report dialog and HTML/CSV/text/JSON exports. Toolbar and mouse/keyboard context access preserve the comparison. Reports include all analysis rows regardless of search, collapse or pagination, with skipped-entry coverage and distinct choices, reviewed resolutions, output previews and historical applied results. Source and both Mac package workflows passed; see release-2.92.0.md for validation and the optional Intel screenshot limitation. Broader product scope and Windows runtime remain open.

## Three-way folder context workflows (2.92.1)

The three-way review context menu now exposes input selection, analysis, per-conflict base/left/right choices and clearing, resolution review, report, folder expansion/collapse, output selection/preview/application and recovery. Actions reuse existing controls and native confirmations. Menus dismiss on outside interaction and state changes, and Apply/Restore require the plan captured when the menu opened. Both Mac packages passed the workflow and a stale-menu regression that proves an old Apply item cannot confirm or write a replacement plan. Full product scope and Windows runtime remain open.

## Application settings transfer (2.93.0)

The settings export/import/reset gap now has a workflow for all current application preferences: appearance, folder-column widths and optional external-editor configurations. Native/in-app File and folder context Session & tools open a preview-based transfer dialog. `.fcsettings` excludes sessions, compared files, histories and shell selection. Source/target compatibility preserves portable appearance when external-editor paths differ. Source and both Mac package workflows verify rollback, stale-preview/native guards and unsaved-session preservation. Session-default management, configurable shortcuts, broader product scope and Windows runtime remain open.


## 2.94.0 — saved session defaults

Added native/in-app File and folder-context access to type-specific defaults. Users review readable preferences, save the current rules/views, or reset future sessions to built-ins. Profiles exclude content, paths, search terms, alignments and pending operations. Source and both Mac package workflows passed, including folder-opened table comparison defaults and preservation of existing/saved sessions. Folder selection and chain expansion regression tests passed. Session-default transfer, configurable shortcuts, multiple windows, remote providers, remaining comparison capabilities and Windows runtime verification remain outstanding.


## 2.95.0 — settings transfer includes defaults

Completed the session-default transfer gap from 2.94.0. Settings export includes all profiles; import/reset previews optionally replace the full list. Missing sections preserve existing defaults, empty lists reset, and existing comparisons remain unchanged. Native application has stale checks and guarded rollback; unit tests exercise rollback failure without clobbering newer profiles. Both Mac packages passed defaults-transfer workflows. Windows runtime, configurable shortcuts, multiple windows, remote providers and remaining full-product capabilities remain outstanding.


## 2.96.0 — keyboard shortcut configuration

Added File and folder-context access to searchable native command shortcuts, with recording, disabling, individual defaults and staged reset. Native overrides update menu bindings; duplicate desktop listeners were removed while browser shortcuts remain. 773 unit tests and browser UI/live-text regressions passed. Source and both Mac packages passed explicit menu-routing tests and persistence checks; physical-key activation was not verified because the Mac is locked and injected Cocoa accelerators did not activate. This limitation remains open. Custom shortcut transfer, multiple windows, remote providers, Windows runtime and remaining product capabilities remain outstanding.


## 2.97.0 — keyboard shortcut settings transfer

Closed the custom-shortcut transfer gap: optional export/import/reset, legacy preservation, platform compatibility and trusted-catalog validation. Combined preference application uses guarded reverse-order rollback and updates native menu bindings after success or recovery. Source and both Mac package workflows passed; all 783 unit tests passed. Physical-key macOS activation remains unverified while locked; Windows runtime, multiple windows, remote providers and remaining product capabilities remain outstanding.


## 2.98.0 — editable workspace and independent windows

Text comparison now uses the editable panes, with compact shared controls and a grouped options dialog. Wrap survives edits, filters and tab restoration. Both Mac packages passed live-text workflows; source folder-chain and multiwindow isolation tests passed. All 783 unit tests passed. Windows runtime, physical-key shortcut validation, remote providers and remaining full-product capabilities remain outstanding.


## 2.99.0 — patch export

Implemented unified patch creation through text options and File/native menus, with exact current buffers, configurable context, cancellable worker generation and preview. Browser and both Mac packages passed export/round-trip/cancellation/reopen checks. Patch application, remote providers, Windows runtime and remaining full-product scope stay open.


## 2.100.0 — reviewed text-entry patch application

Apply Patch supports UTF-8 input/paste, file-entry selection from a multi-file patch, either editor, reverse direction and preview. Exact-context matching and stale-text checks protect editor state; apply participates in undo/redo and does not save disk files. Browser and both Mac packages passed. Whole-folder patch application, remote providers, Windows runtime and remaining full-product scope stay open.


## 2.101.0 — reviewed whole-folder patch application

Added native Actions and right-click Session & tools access to multi-file patch preview/application. Covers modify/create/delete/rename, reverse, path stripping, encodings, backups, stale-source/root guards, tree refresh and renamed open comparisons. All 834 units, source and both Mac package workflows, folder interaction regressions and all package/download checks passed. Metadata patching, remote providers, Windows runtime and remaining full-product capabilities stay open.


## 2.101.1 — patch cleanup lifecycle and history

Rejected patch previews now release staged files; cancelled native confirmation retains the reviewed preview. Successful writes with failed staging cleanup remain Completed with a visible and exported cleanup warning. All836 units, warning/history browser checks, source and both Mac package workflows and all package/download checks passed. Direct reference inspection was retried but the Mac remains locked. Windows runtime and remaining full-product scope stay open.


## 2.102.0 — selected attributes and permissions

The native Actions menu and right-click Properties submenu now expose Change attributes. Selected POSIX rwx permissions and Windows Read-only/Hidden/System/Archive flags have staged review, nonrecursive behavior, stale/native identity checks, guarded rollback and action history. Source and both Mac package workflows,849 unit tests, browser/UI/menu regressions and package/download checks passed. One Windows-native test is skipped on macOS; Windows runtime, ACL/ownership editing, further platform attributes and the remaining product scope stay open.


## 2.103.0 — archive copy/delete/rename and ZIP output

Archive context actions and compact menus now support reviewed in-memory subtree edits and explicit ZIP export. Source and both Mac packages passed byte-level edit/export, cancellation, unchanged originals, session restoration and dirty-authority removal; browser races prevent stale publication.861 units passed,1 Windows-native test skipped. Existing archive save/extraction/menu regressions and all package/download checks passed. Archive content editing/additions, undo/redo, broader formats/metadata, remote providers and Windows runtime remain open.


## 2.104.0 — archive undo/redo

Native, compact submenu and context actions now restore archive edits with bounded per-tab runtime history and staged atomic publication. Source and both Mac packages passed exact-byte copy/delete/rename restoration, cancellation, redo invalidation, tab isolation and saved-session reopening without transient history. 866 units passed, one Windows-native test skipped. Workspace/race regressions and all package/download checks passed. Windows runtime, contained-file editing/additions, remote providers and full-product scope remain open.


## 2.105.0 — disk files into archives

Archive submenu/context actions now import multiple disk files with destination/overwrite review, bounded consistent snapshots, name/type/output-size validation, stale-picker guards and undo/redo. Source and both Mac packages passed exact binary/empty export bytes, cancellation, new archives and tab/session restoration. 877 units passed, one Windows-native test skipped. Existing history/save/menu regressions, light/dark visual review and all package/download checks passed. Recursive folder imports, contained-file editing, remote providers, Windows runtime and full-product scope remain open.


## 2.106.0 — recursive disk folders into archives

Archive submenu/context actions now import a selected folder tree with root/empty-directory preservation, merge/overwrite review and undo/redo. Bounded enumeration, ancestor/file identities and full-tree revalidation reject changed sources. Source and both Mac packages passed recursive exact-byte import/export, cancellation, new archives, conflict/link rejection and unchanged source checks. 893 units passed, one Windows-native test skipped. Picker races, existing file-import/save/menu regressions, theme review and package/download checks passed. Contained-file editing, remote providers, Windows runtime and remaining full-product scope stay open.


## 2.107.0 — text edits back into archives

Contained text comparisons now apply encoded contents to their inactive parent archive with review and archive undo/redo. Runtime-only exact-input links reject stale parents, replaced sources and missing/closed sides. Source and both Mac packages passed byte-exact UTF8 BOM/UTF16LE CRLF export, repeated applies, cancellation, undo/redo, wrap and saved-session isolation. 893 units passed, one Windows-native test skipped. Staging API, workspace/live-text, corrected theme and all package/download checks passed. Other entry comparison types, remote providers, Windows runtime and remaining full-product scope stay open.


## 2.108.0 — binary edits back into archives

Binary child comparisons now apply raw edited bytes to the parent archive with review and archive undo/redo. Exact input checks and replacement/swap invalidation preserve runtime link boundaries. Source and both Mac packages passed byte edits, copied ranges, repeat apply, cancellation, undo/redo, stale and missing sides and session isolation. 893 units passed, one Windows-native test skipped. Text-entry/binary-range/advanced regressions and all package/download checks passed. Table/media output, binary native undo routing/history, remote providers, Windows runtime and remaining full-product scope stay open.


## 2.109.0 — binary tab history and stable archive selection

Native and toolbar binary Undo/Redo share bounded per-tab runtime history, excluded from saved sessions. Archive selection counts now reserve space so toolbar wrapping cannot move a row between double-click events. Source and both Mac package workflows passed exact bytes, tab isolation, replacement/session resets and independent archive parent/child history; eight-width archive layout checks passed. 896 units passed, one Windows-native test skipped. Folder selection, node refresh, chain expansion and all package/download checks passed. Reference inspection remains unavailable while the Mac is locked. Windows runtime, remote providers, table/media archive output and remaining full-product scope stay open.


## 2.110.0 — table results back into archives

CSV/TSV/XLSX child comparisons now apply their edited result to either original archive entry after format review. CSV/TSV use regenerated UTF-8; XLSX explicitly replaces the entry with a single-sheet values-only workbook. Exact async state checks and runtime-only links retain parent undo/redo and reject stale/replaced/missing/closed targets. Source and both Mac package workflows, isolated export/race checks, 896 units (one Windows-native skip), existing text/binary entry regressions, theme review and all package/download checks passed. Media output, workbook preservation, remote providers, Windows runtime and remaining full-product scope stay open.


## 2.111.0 — archive-entry menus and Save As repair

Linked child tabs provide context/keyboard apply and parent-return actions with captured target guards; native File commands use the same review routes and preload allowlist. Tab menus share themed constrained panels and outside-click/resize dismissal. A discovered undefined variable in archive entry Save As was repaired. Source and both Mac menu/save workflows, 896 units (one Windows-native skip), existing folder/tab regressions, light/dark review and package/download checks passed. Full-product scope and Windows runtime remain open.


## 2.112.0 — table result history and import readiness

Table edits now retain bounded per-tab undo/redo, including grouped typing and structural changes, without serializing history. Archive imports gate entry actions until their owning request is ready. Source and both Mac package history/live-text checks passed; 902 units passed with one Windows-native skip. Real Mac Command-F/Escape and wrap controls were verified after unlock. One intermittent archive reimport stress failure remains unexplained after 160 successful traced iterations. Full-product scope and Windows runtime remain open.


## 2.112.1 — current folder audit and welcome title

Re-inspected the live Actions menu. Source regressions passed modifier/range selection, single-click selection, double-click opening, immediate-node reads, chain expansion and grouped menu inventory. Window screenshots remain unavailable, so menu inventory alone does not prove full behavior parity. Fixed stale dirty/name title after closing the last session; cancellation and new-session behavior passed source and both Mac packages. Package/download/branding checks passed. Full scope remains open.


## 2.113.0 — compressed ZIP output

The folder toolbar/native/context inventory review found routes for the current implemented folder command set; this does not prove full reference parity. Optional compressed ZIP output now closes one broader archive gap: save review, per-file deflate only when smaller, byte/CRC/path integrity and existing output bounds. Source and both Mac workflows, 909 units (one Windows-native skip), gated stale-save/error recovery, edited archive undo/redo, theme review and package/download checks passed. Original archive format/metadata preservation, encryption, ZIP64, remote sources and Windows runtime remain open.


## 2.114.0 — folder text encoding

Explicit folder decoding now reaches text normalization, cache keys, filtered-operation snapshots, child comparisons, selected pairs and reports. Auto remains default with exact-byte fallback for invalid text. Toolbar, native and context routes passed alongside saved sessions and tab isolation in source and both Mac packages. 919 units passed (one Windows-native skip). Final dialog border/contrast and all distribution checks passed. Additional content rules/codecs, remote providers, full-product scope and Windows runtime remain open.


## 2.114.1 — folder selection scale

Selection synchronization now writes row classes, aria-selected and tabIndex only when changed. A real 1,500-pair fixture plus two one-sided files (3,004 rendered rows) passed in source and both Mac packages: single-click mutations 12,021 → 2, modifier add 4, focus-only 2, Shift range 14, select/clear-all 3,002. Selection semantics, missing-side behavior and keyboard focus remain covered. Existing selection, page-navigation and pane-focus regressions passed. The Intel test needed an explicit 60-second initial-scan expectation instead of the test framework’s five-second default; the rerun passed.

All three platform ZIPs, packaged renderer identity, download sizes/hashes and shipping-brand checks passed. Full-tree rendering remains proportional to loaded rows; Windows runtime and full-product gaps remain open.


## 2.114.2 — display dialog focus during folder refresh

Current source and both 2.114.1 Mac packages passed the lazy comparison queue regression: settled siblings are skipped on expansion, collapsed nodes are skipped, and stale results do not override new rules or sessions. The expanded context inventory passes in source. A packaged context run exposed a real display-dialog focus failure: background disk refresh replaced the remembered row DOM node. A deterministic test reproduces this failure in the old ARM package.

Display preferences now captures a scoped row resolver using session, roots, pane and row identity, restores the replacement row, and falls back to its pane if removed. The deterministic regression passes in source and both 2.114.2 Mac packages, covering actual disk/background refresh, modal focus, Done/Escape, deletion, session isolation and generic text focus. Browser display checks passed after updating their stale toolbar selector to the current Swap control. Package version/renderer identity, three ZIP integrity checks, download sizes/hashes/browser download and shipping-brand checks passed. The final Apple Silicon packaged context-menu integration also passed. Windows runtime and broader product gaps remain open.


## 2.115.0 — FLAC inputs and asynchronous audio loads

Native reference inspection was unavailable because the Mac was locked; this release addresses the existing full-product audio gap. Audio inputs now include native FLAC, with folder double-click and shell routing, original-byte sessions and source properties in reports. Source rate is preserved and a known-sample runtime probe calibrates native normalization for exact 8/16/24-bit PCM recovery. Input limits and mono/stereo scope are explicit. Native decoder checksums are not verified; UI and reports disclose this, and no byte-integrity claim is made.

Native browser tests pass exhaustive8/16-bit values,32768 dispersed24-bit values,24 rate/channel/depth combinations, genuinely compressed constant subframes, truncated stream and corrupted header rejection. Source and both Mac packages pass exact WAV/FLAC equivalence, changed samples, playback, session restore/swap, invalid replacement preservation and folder single-click selection/double-click opening. Async tests cover superseded requests, stale failures, reset/restore isolation and pending-report guards. Existing WAV/AIFF desktop regressions and921unit tests pass, with one Windows-only skip. All three ZIPs, packaged assets, download hashes and shipping-brand checks pass. Remaining scope includes FLAC checksum/metadata handling, broader precision/channel/length support, other compressed formats, remote sources and Windows runtime.


## 2.115.1 — folder focus after disappearing entries

A deterministic shipped-package regression reproduced focus jumping from removed20.txt to00.txt. Folder rendering now resolves the first surviving successor from the prior visible order, then the nearest predecessor, skipping missing-side placeholders. It retains other selected rows without selecting the fallback; no remaining entries falls back to the pane. Rebuilt nonroving rows also receive explicit tabindex=-1 so programmatic focus works. Comparing the DOM tabIndex property alone had treated absent attributes as equivalent.

Fixed source passes real disk deletion in both panes, middle/end removal, retained selection, missing-side gaps, subsequent arrows, control/modal focus and empty panes. Existing click/modifier/range and page-navigation tests pass. The3004-row scale regression still passes with2single-click attribute mutations. Both Mac packages pass the new regression. Intel needed an explicit60-second initial scan wait in place of the framework default5 seconds; behavioral assertions retained their normal limits. All three ZIPs, packaged renderer/version identity, download hashes and shipping-brand checks pass. Windows runtime and full-product gaps remain open.


## 2.116.0 — TAR and TAR.GZ export

The existing archive output gap now has a format selector in toolbar/context export review. ZIP remains the default; TAR and TAR.GZ preserve file bytes, portable paths and empty directories, using PAX for long/Unicode paths and out-of-range timestamps. UTC seconds, epoch fallback and standardized permissions/ownership are explicitly disclosed; original metadata and in-memory ZIP edit limitations remain open. The shared validator rejects directory names whose trailing slash would exceed the reader limit.

Source and both Mac packages pass both-side/menu exports, rename output, cancellation/reset, source/history preservation and exact roundtrip bytes. Browser races confirm obsolete gzip exports cannot save after reset/session change, and compressor failure recovers controls. System tar independently reads both formats. Existing ZIP regressions and 929 unit tests pass (one Windows-only skip). Final light/dark package screenshots are readable without clipping. All three ZIPs, renderer/version identity, download hashes and shipping-brand checks pass. Windows runtime and broader product requirements remain open.


## 2.116.1 archive keyboard follow-up

Archive Compare now has one row in the Tab sequence, with arrow keys, Home/End and Page Up/Down for navigation. Left collapses a folder or moves to its parent; Right expands it or enters its first child. Space toggles selection, Shift extends a range, Ctrl/Command moves focus without changing selection, and Ctrl/Command+Shift adds a range. Enter opens the selected comparison. Single-click selection and double-click opening remain intact.

Async folder results retain the current row focus without stealing focus from dialogs or other controls. Empty trees remain keyboard focusable, collapsed descendants fall back to their parent, and disclosure double-clicks toggle only once. Rows expose their hierarchy and expansion state to assistive technology.

Validation: the previous build reproduced 81 separate Tab stops. The corrected workflow passes source Electron and both Apple Silicon/Intel Mac packages. Browser checks cover delayed results, modal/control focus isolation, additive ranges, empty trees and disclosure double-clicks. Existing archive edit, layout and stale-edit regressions pass. All three ZIPs, packaged versions/renderer assets and download size/SHA-256 checks pass. Windows runtime and physical keyboard checks remain pending; native UI access still reports the Mac locked.


## 2.116.2 disclosure interaction follow-up

Double-clicking a folder expansion arrow now expands or collapses it exactly once. Previously both click events scheduled toggles, returning the folder to its starting state. The second click now restores row selection/focus without scheduling another scan, and the double-click does not bubble into the row-open action.

Source verification reproduced the bug with actual double-click input in all four cached expand/collapse cases across the left and right panes. The fix passes those cases with shared inline expansion, selected/focused row and unchanged comparison tab count. Folder selection and file double-click opening, automatic single-child-chain expansion, node-scoped comparison queuing and grouped context menu checks also pass.

Both Apple Silicon and Intel Mac packages pass the disclosure regression. All three ZIPs pass integrity checks, bundled version/renderer assets match, download sizes and SHA-256 pass, and the Windows ZIP downloads successfully in the browser. Shipped UI/native sources contain no reference-product branding. Windows runtime remains unverified. The larger full-product scope remains open.


## 2.116.3 folder-to-text rule inheritance

Opening a text comparison from a Content-mode folder now disables ignore-case and ignore-whitespace options for that child. Previously, permissive saved Text Compare defaults could make a folder row marked Different open as No differences. The fix applies to double-click, explicit Open as text and selected-pair comparisons. Standalone text sessions retain their saved defaults. Normalized folder modes continue to set their own case, horizontal-whitespace and minor-difference options; metadata-only modes retain text defaults because they do not define text content rules.

Source verification covers all three Content child routes, all four normalized modes, unchanged saved defaults, standalone text defaults, child edits/parent restoration, case-rule reports and encoding propagation. The prior case-report regression was updated to inspect the report's current pathA/pathB schema. The general text-rule workflow passed but its Electron teardown stalled; its owned Electron process was terminated before proceeding. Case, encoding, child-rules and the new regression completed successfully.

Both Apple Silicon and Intel Mac packages pass the complete saved-default regression. All three ZIPs pass integrity checks, packaged versions/renderer assets match, download sizes/SHA-256 and browser Windows ZIP download pass, and shipped sources pass the branding check. Windows runtime and full-product scope remain open.


## 2.117.0 compact folder options

Folder Compare now groups comparison rules, tree/sort settings, pairing/alignment, operation scope, reports and snapshots in a Filters & options dialog. Paths, navigation, search/masks, selection, color legend and expand/collapse remain visible. Existing control elements and handlers are retained, so context/native actions and session state continue to share the same implementation.

At 1440 × 928 the first file row starts at 269 px instead of about 378 px, recovering about 109 px (roughly five rows) for the list. The dialog uses borderless pastel sections in light/dark themes, closes on workspace changes, and supports Done/Escape focus restoration. Actions opening another dialog close Options first, returning focus to a visible control afterward.

Source validation passes actual comparison/view changes, nested encoding/report dialogs, focus restoration, inline expansion, file click semantics, checkbox-free three-column rows and responsive dialog geometry at 1440 × 928, 1024 × 768 and 800 × 600. Light/dark screenshots were inspected. Updated existing rule/encoding tests use the visible Options workflow; child-defaults, case/encoding, selection, disclosure and grouped context-menu checks pass.

Both Apple Silicon and Intel Mac packages pass the complete options/geometry regression. Intel assertions completed successfully but Electron teardown stalled; the owned test process was terminated, and the test exited successfully. All three package versions and renderer/CSS assets match, ZIP integrity and download size/SHA-256 checks pass, the Windows ZIP downloads in the browser, and shipped sources contain no reference-product branding. Windows runtime and full-product scope remain open.


## Post-2.117.0 folder workflow verification

The compact Options layout preserves sorting and paired row order, loaded-only flat views, parent/child return, new-file creation, saved view restoration, selected file/folder comparisons, filtered recursive copy/move/delete, directional and both-side sync previews, native/context routes, selected refresh, node-scoped comparison queues and report exports. Their source desktop regressions pass after migrating UI actions to explicitly open Options; assertions are retained. Other relocated-control test scripts were migrated and syntax-checked; this does not claim every migrated script was runtime-tested.

A new gated native selected-refresh test changes formerly different files to equal while the Differences filter is active. Both sides retain the nearest surviving row as keyboard focus, preserve unrelated selections, drop hidden selections without selecting a replacement, and continue ArrowDown navigation. A held refresh finishing while Options is open preserves modal focus. Switching to All shows the still-existing files as equal. Source, Apple Silicon and Intel packages pass. No production change was required for this behavior.

Windows runtime and the broader full-product gaps remain unverified/incomplete; these focused checks do not establish full parity.

Additional post-layout source checks pass recursive scanning/cancellation, content/size/time comparison rules and timestamp tolerance, saved rule restoration/tab isolation, filename matching with duplicates and actual-path copy. Tests assert visibility by opening Options; hidden-state checks for mode-specific controls inspect their own hidden state rather than merely relying on the closed dialog.


## 2.118.0 archive chain expansion

Archive Compare now follows a chain of sole child directories when expanding a folder. This matches the existing disk-folder workflow: java/oracle/fsgbu/tfpm/orchestrator opens inline in one action. Keyboard, disclosure and right-click expansion share the behavior; selection and focus stay on the chosen folder. A file, branching node, empty directory or type conflict ends the chain. Unrelated closed siblings are not read.

Each expansion follows at most 200 folders, then shows a continuation message; the next directory can be expanded explicitly. Per-request guards prevent a collapsed or replaced chain from resuming after delayed comparison results. Related ancestor/descendant toggles invalidate that request; collapse-all, import and reset cancel every pending chain. Saved-session restoration retains its existing explicit expansion behavior.

The previous built app stopped at the first child. Updated source desktop checks pass paired/one-sided chains, all expansion routes, boundaries, focus and explicit file opening. Browser checks verify exact node reads, conflicts, the 200-node limit and continuation, collapse/reopen races, collapse-all/reset cancellation and external focus preservation. Existing archive keyboard, editing, focus and import-race checks pass.

Both Apple Silicon and Intel Mac packages pass the complete archive-chain desktop workflow. All three package versions and renderer/CSS assets match, ZIP integrity and download size/SHA-256 checks pass, the Windows ZIP downloads in the browser, and shipped sources pass the branding check. Windows runtime and full-product scope remain open.


## 2.119.0 ZIP64 archive input

Archive Compare now reads ZIP64 directory records, ordered ZIP64 extra fields, local-only ZIP64 headers and signed or unsigned data descriptors. The existing limits remain: 32 MB input, 64 MB expanded content and 50,000 entries. ZIP export continues using classic headers. Workbook ZIP parsing is separate and unchanged.

The reader checks safe integer bounds, matching classic/ZIP64 metadata, local headers, descriptor lengths, overlapping entries and content CRC. Multi-disk and encrypted archives remain unsupported. Field interpretation follows the [PKWARE ZIP specification](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT).

Validation: all 940 unit tests completed, with 939 passing and one Windows-only skip. Ten new tests cover ZIP64 variants and malformed records, including archives independently generated by Python zipfile and exact decoded bytes. Source desktop and both packaged Mac apps pass comparison against classic ZIP, nested and empty files, child text comparison, classic ZIP export and unchanged source bytes. Existing source ZIP editing, compression and TAR export regressions pass.

All three release ZIPs pass integrity checks. Package versions and renderer/CSS assets match; download links, sizes, SHA-256 and the Windows browser download pass. Shipped sources pass the branding check. Windows runtime, direct keyboard input (desktop tool still reports the Mac locked), and remaining full-product scope are not verified or complete.


## Post-2.119.0 folder interaction and Options audit

Source desktop checks pass single-click selection, double-click child opening, modifier/range selection and right-click focus; immediate-node comparison updates added/deleted entries without reading unrelated branches or opening extra tabs; live comparison colors retain DOM identity, focus, selection and scroll. The grouped context menu regression passes action inventory, keyboard navigation, disabled skips, selection preservation, stale-selection rejection and light/dark edge placement. Matching-file selection passes both sides, toolbar/context/native routes, active masks/rules and unopened-node boundaries.

Three regression scripts retained hidden-control interactions after the compact Options migration. Session defaults and timestamp editing now open Options before filling tolerance, blur the input to commit the user edit, and close with Done. The normalized-text-rule test now chooses its method through Options. No forced clicks or production behavior changes were needed.

Corrected session-default and timestamp workflows pass source, Apple Silicon and Intel packages: wrap/rules and per-type defaults, saved-session precedence, no content/search leakage, stale-default guards, modified-time cancellation/application, preserved access time and side isolation. Source normalized-text-rule checks pass UTF-16/32, binary fallback, meaningful line breaks, lazy descendants, rule inheritance, saved modes and exact-byte copy despite normalized equality. Selected text reports pass native/context routes, HTML/JSON/text output, selected-only scope, one-sided content, encoding/EOL metadata, forged/stale authority rejection and unchanged focus/selection/tab count.

This audit changes tests and evidence only; release 2.119.0 remains current. Windows runtime and broader full-product gaps remain open.


## 2.120.0 separate folder text encodings

Folder text comparison now supports a shared encoding with optional left and right overrides. Open Text encoding from Filters & options, the context menu or the native menu. Each side can inherit the shared choice or explicitly use Auto. Existing saved sessions retain their shared behavior. Overrides persist in sessions and defaults, follow the roots when swapped, and carry into child text editors, selected-pair comparisons and reports.

Normalized comparison caches and operation snapshots use each side's effective encoding. Identical bytes interpreted as different text correctly differ under text rules; exact content mode remains byte-based. Invalid or binary text retains the existing byte fallback. Node comparison remains scoped to immediate entries; unopened descendants remain unread.

Validation: 945 unit tests pass with one Windows-only skip. The new source desktop workflow and both Apple Silicon and Intel packages pass mixed CP1251/UTF-8 normalization, identical-byte decoding differences, cancellation, source swapping, cache/color invalidation, invalid-byte fallback, scoped node and selected refresh, child editors, selected pairs, reports, saved-session restoration and tab isolation. IPC assertions verify the exact encoding pair passed to native reads. Existing shared encoding and strict-child source regressions pass. Both light and dark dialog screenshots were visually inspected.

All three release archives pass ZIP integrity, version and renderer/CSS checks. Changed native modules match the source in each package. Download sizes, SHA-256 hashes and the Windows browser download pass. Shipped source branding checks pass. Windows runtime and the remaining full-product scope remain open.


## Post-2.120.0 filtered operation and defaults audit

Twenty new operation tests pass for mapped copy/move/delete and copy/move to a third folder, each with sources on both sides. Fixtures use aligned paths and CP1251 left versus UTF-8 right, equal normalized text with different raw bytes. Differences-filter operations are empty; matching-text operations affect only eligible files. Output uses exact source bytes, excluded descendants remain unchanged, and changing an excluded original counterpart after preview rejects execution before writes. Third-folder eligibility is based on the original comparison, not the destination. No production defect was found.

The native side-encoding regression now also saves a shared CP1251 default with explicit left Auto and inherited right encoding. New folder sessions retain those choices without carrying source roots. Source and both existing 2.120.0 Mac packages pass the extended workflow. This audit changes tests and evidence only; no package rebuild is necessary. Windows runtime and full-product gaps remain open.


## 2.121.0 optional persistent file action history

File action history now offers Keep history between app runs. Retention is off by default. Enabling it saves current entries and subsequent attempts on this computer; disabling it removes the saved entries while retaining the current window's in-memory list. Clear history preserves the retention setting and does not delete files or backups. Opening history refreshes entries from other windows. JSON export is retained.

The shared native store keeps at most 100 attempts, with up to 100 paths and 32,768 path characters per attempt. UUID deduplication prevents duplicate records, and equal-time entries retain newly appended attempts. Writes use private temporary files and atomic replacement, with serialized updates across windows. Reads are bounded and reject invalid, corrupt, symbolic-link or hard-linked stores rather than silently replacing them. A failed save remains visible in the current window with an error message. History is an action log, not a crash-recovery journal.

The history dialog uses borderless rounded styling. The existing rename test was corrected to expand the parent once, matching automatic sole-child chain expansion.

Validation: 973 unit tests pass with one Windows-only skip. Browser checks cover delayed initial reads, queued appends, failure retention, focus restoration, migration, clearing and opt-out behavior. Source native checks cover four app launches, actual renames, retained/removed records, JSON export and multiwindow clearing without changing file contents. Existing rename, timestamp and patch-history checks pass. Light/dark rendering was inspected.

Both Apple Silicon and Intel packages pass the full restart and multiwindow native workflow. All three release ZIPs pass integrity checks; versions, renderer/CSS and changed native modules match source. Download sizes, SHA-256 and the Windows browser download pass, as does the shipped-source branding check. Windows runtime and full-product scope remain open.


## 2.121.1 queued native work close guard

A native request could be accepted from one window but still be waiting behind another window in the shared operation queue. The close guard only counted running handlers, so closing the waiting window could reject its request before it started. A gated regression reproduced this with a persistent history append: the window closed while its save was still queued.

The native dispatcher now counts accepted queued and running requests per window. Close and quit guards include that count, and a finally handler releases it on success or failure. This extends the existing close protection to waiting requests. The window can be closed once its pending work completes; it is not automatically closed afterward.

Source regression verifies both records persist, an immediate IPC acknowledgement establishes that the request has arrived, and a rejected queued request also releases the guard. Existing multiwindow isolation and persistent-history restart workflows pass.

Both packaged Mac architectures pass the gated regression. The full unit suite passes 973 tests with one Windows-only skip. All three release ZIPs pass integrity checks, and versions, main-process code and renderer/CSS assets match source. Download sizes, SHA-256 and the Windows browser download pass; shipped branding checks pass. Windows runtime and full-product scope remain open.


# Release 2.122.0 — Mirror selected folders from any folder session

Folder context menus and the native Actions → Synchronize menu now offer Mirror to Left and Mirror to Right. These commands preview a one-way mirror without changing the current session type or stored direction.

Selected folders include collapsed descendants. The preview lists copies, replacements and destination-only deletions, while preserving unselected siblings and entries excluded by the current file-action filters. Applying still uses the existing native confirmation, backups and stale-preview checks.

The first native regression exposed an empty preview for a collapsed selected directory: the existing mapped planner intentionally operated on exact selected rows. The new commands opt into subtree selection, expanding selected paths in the mapped destination namespace. Existing exact-selection callers retain their behavior.

Six new unit tests cover both directions, filtered destination-only parents, mapped directories and child names, reserved counterparts, disk changes after preview, and exact-selection compatibility. The full unit suite passes 979 tests with one Windows-only skip. Existing grouped context-menu and merge/sync direction regressions pass.

The native source workflow passes both context and actual application-menu callbacks, preview cancellation, native-confirmation cancellation and accepted apply with exact bytes, filtered descendants and untouched sibling/session state. Its first native-menu check caught missing preload dispatch entries, which were added. The light preview screenshot was inspected for readable operation paths, scope, deletion warning and backup note. Both final Mac architectures pass the extended workflow across Folder Compare, Folder Merge and Folder Sync. All three ZIPs pass integrity checks; package versions, changed native modules and renderer assets match source. Download sizes, SHA-256 and Windows browser download pass; shipped branding search is clear. Light and dark previews were inspected: operation lists and actions fit, but the shared dark dialog’s muted description/backup text needs a contrast follow-up. Windows runtime and broader full-product scope remain open.


# Release 2.122.1 — Readable shared dialogs

Shared dialog paragraphs used a fixed green color that did not follow the active theme. Folder previews consequently showed their scope, deletion explanation and backup note at 4.22:1 contrast in dark mode and 3.62:1 in light mode.

The base paragraph rule now uses the theme's muted text token, with a readable fallback. Contrast is 8.62:1 in dark mode and 5.67:1 in light mode. The shared dialog frame is borderless with a 16px corner radius; keyboard focus outlines remain visible.

The browser display regression now checks computed paragraph contrast of at least 4.5:1 and zero dialog borders in both themes. Existing theme/system preference, density, text size, paired panes, focus restoration and mobile width checks pass. Light and dark screenshots were inspected.

Both packaged Mac architectures pass computed contrast/border assertions in light and dark themes and the full native mirror workflow. Packaged screenshots were inspected. All three ZIPs pass integrity checks; versions and final renderer/CSS assets match source. Download sizes, SHA-256 and Windows browser download pass; shipped branding search is clear. No comparison-engine changes were made in this release. Windows runtime and full-product scope remain open.


# Release 2.123.0 — Additional Windows text encodings

Explicit text input/output now supports Windows-1250 (Central European), 1253 (Greek), 1254 (Turkish), 1255 (Hebrew), 1256 (Arabic), 1257 (Baltic) and 1258 (Vietnamese). The choices also appear in folder text-encoding rules and folder patch controls. Shared codec consumers, including CLI and batch jobs, accept these names.

Mappings follow the [official Unicode-hosted Microsoft tables](https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/), with individual source URLs and SHA-256 hashes recorded in `src/windows-codepages.cjs`. Undefined bytes are rejected. Output rejects unrepresentable characters without replacing a destination file. Auto remains Unicode BOM/UTF-8 based. Windows-1258 preserves combining sequences exactly; automatic normalization of precomposed Vietnamese characters is not performed. Existing Windows-1251/1252 behavior is unchanged.

The native regression exposed an existing saved-session defect: requested Read as choices were not persisted independently of output format and source provenance. Sessions and tab snapshots now retain a validated `readEncodings` pair, swap exchanges both choices, and changing a choice marks the session dirty. Older sessions use their known source encoding when available, otherwise Auto; blank sessions start with Auto.

Validation:

- All 896 high-byte mapping positions independently match Python's strict codecs; exhaustive valid-byte roundtrips, undefined bytes, BOM restrictions and output rejection pass.
- Browser imports and CLI Unicode comparisons pass for seven independently encoded multilingual fixtures.
- Native source tests pass all seven exact-byte input/save workflows, Greek/Arabic edits, session reopening, swapping, tab isolation and rejected lossy saves.
- Greek/UTF-8 folder comparison, expanded child decoding, inherited input codecs and saved folder sessions pass.
- Full unit suite: 995 passed, one Windows-only skip.

Both final Mac packages pass the complete native encoding workflow. All three ZIPs pass integrity checks; versions, packaged codec tables/native sessions and final renderer/CSS assets match source. Download sizes, SHA-256 and Windows browser download pass. The shipped branding search is clear. Windows runtime and broader full-product scope remain open.


# Release 2.124.0 — FLAC audio integrity

FLAC comparison now verifies the STREAMINFO MD5 against reconstructed signed, little-endian, interleaved PCM samples before accepting an input. Mismatches display an error and preserve the current comparison. A zero digest is treated as unavailable, as required by RFC 9639 section 8.2.

The audio metadata labels distinguish “Audio MD5 verified” from “No audio MD5 stored”. JSON reports include `streamMd5: verified | unavailable`. This verifies decoded audio integrity, not authenticity or independent validation of every frame CRC. Incremental hashing uses a small reusable buffer, and decoder buffer detachment cannot alter the retained digest or original input.

Validation:

- Full unit suite: 1,007 passed, one Windows-only skip.
- Independent Node crypto checks cover incremental MD5, signed PCM widths, channel interleaving, missing/mismatched digests and decoder buffer handling.
- Real browser decoding passes 24 depth/channel/rate combinations, exhaustive 8/16-bit values, dispersed 24-bit values and corrupted MD5 rejection.
- Source desktop checks pass checksum metadata/reporting, WAV equivalence, changed samples, playback, original-byte sessions, restore/swap, rejected input preservation and folder routing.

Both packaged Mac architectures pass the full native FLAC workflow. All three ZIPs pass integrity checks; packaged versions and final renderer/CSS assets match source. Download sizes, SHA-256 and the Windows browser download pass. The shipped branding search is clear. Windows runtime and the remaining full-product scope are still open.


# Release 2.124.1 — Folder disclosure focus

A native Intel regression found that a folder redraw could lose keyboard focus when the expand/collapse button was focused. The existing redraw guard recognized the row itself and empty pane, but not a control inside a row. The focus repair treats focused row descendants as part of the folder tree and restores the row after rebuilding it.

Double-click disclosure regression coverage includes immediate/delayed clicks, replacement DOM, exactly one toggle/scan, retained selection/focus and no new comparison tabs. The broader folder audit covers compact columns, modifier/range selection, inline single-child chains, menus and asynchronous status colors.

A deterministic source regression failed before the fix and passed afterward: focus the disclosure, refresh, then verify focus returns to the rebuilt row. Natural and controlled second-click tests retain exact toggle, scan, selection and tab assertions. Source refresh-focus, filter-focus and selection regressions pass. Both packaged Mac architectures pass the new disclosure regression. All three ZIPs pass integrity checks; versions and final renderer/CSS assets match source. Download sizes, SHA-256 and Windows browser download pass. Shipped branding search is clear. Windows runtime and the broader feature gaps remain open.


# Release 2.125.0 — Unix metadata folder comparison

Folder comparisons can optionally check Unix permissions, numeric owner IDs and numeric group IDs alongside the existing content, normalized-text, size and timestamp methods. Flags are off by default and persist with saved comparisons. Controls are inside Filters & options, right-click Compare > Metadata options, and native View > Folder Comparison > Unix Metadata.

Paired files and directories in the opened node are classified without scanning closed descendants. Results retain their underlying file-comparison status and the specific metadata differences, so identical bytes with different permissions are not described as different content. Reports retain this distinction. Permissions include the POSIX permission and special bits (mask 07777); ACLs and extended attributes are not included. Numeric UID/GID comparisons do not resolve account names. Windows rejects enabled Unix criteria explicitly and disables the corresponding controls. An imported session with enabled Unix rules offers Disable Unix checks to clear them; actual Windows execution remains unverified.

Node, selected-file, selected-entry refresh, filename-matching and filtered-operation snapshot paths share the criteria. Metadata changes invalidate row authority and cache entries; changes during a comparison are rejected. Comparison does not modify attributes, and existing transfer behavior and recovery formats are preserved.

Validation:

- 1,016 unit tests passed; one Windows-only skip.
- Eight focused Unix metadata tests cover flags/platform rejection, real permissions on files/directories, selected/filename workflows, snapshot eligibility, numeric owners/groups, permission-bit masks, cached changes, mid-comparison mutation and legacy directory behavior.
- Source desktop workflow passes native/context controls, opt-in/opt-out colors, scoped expansion, reports, saved-session/tab/swap retention and unchanged disk contents/metadata.
- Light and dark dialog screenshots inspected.

A deliberately delayed native scan reproduced lost choices when several metadata checkboxes were changed quickly. Queued, per-session checkbox intents now survive rescans; the gated regression fails before the fix and passes afterward. Existing folder rule, live-color and grouped-context regressions pass. Both final Mac packages pass the full native workflow, including the delayed-scan regression. All three ZIPs pass integrity checks; packaged versions, changed native modules and final renderer/CSS assets match source. Download sizes, SHA-256 and Windows browser download pass. The shipped branding search is clear. Windows execution and the broader product scope remain open.

## 2.126.0 — Configurable automatic refresh

Added saved folder refresh intervals (Off through five minutes) in compact Tree & display options, context View and native Folder Comparison menus. Existing root/opened-node scope is retained; recursive/filename modes remain manual. New scans pause for dialogs/busy work; already queued comparisons may finish. Source and both final Mac packages pass real external-edit/deletion, closed-node exclusion, dialog/off/manual, session/tab/swap/default tests. A native-call settlement gate fixes the Intel test assumption about already queued comparisons. 1022 units pass with one Windows-only skip. Package integrity/assets/downloads/branding checks pass. Windows runtime and full product parity remain open.

## 2.127.0 — Timestamp exception implementation in progress

Directly inspected the installed reference application's Session Settings > Comparison tab on 2026-10-21. It exposes one-hour daylight-saving and whole-hour timezone exceptions alongside timestamp tolerance. Cancelled the dialog without applying settings. The [official comparison-settings documentation](https://www.scootersoftware.com/v5help/sessiondircomparison.html) confirms one-hour versus whole-hour-multiple semantics. Further Compare implementation is in progress; this inspection establishes option inventory, not exhaustive behavioral parity.

Implementation verified: strict opt-in timestamp flags share nanosecond-precision equality in node/selected/filename and captured snapshot classification. Inclusive tolerance applies near allowed offsets. Raw displayed dates and newer ordering remain unchanged. Native focus initially failed because menu dispatch disabled the mode selector; deferred guarded focus fixes it. A held scan verifies rapid choices survive. 1027 units pass with one Windows-only skip; source and both final Mac packages pass full native workflow, existing folder-rule/live-color tests pass, and both theme dialogs were inspected. ZIPs, final packaged assets, downloads and branding verified. Windows execution and broader product parity remain open.

## 2.127.1 — Exact-path filename spelling

A real Mac fixture showed left Readme.txt and right README.txt falsely paired as Readme.txt on both sides. Filesystem lookup accepted the alias while operation snapshots used actual names. Exact tree entry resolution now checks canonical spelling before and after metadata reads. Differently spelled names remain distinct unless explicitly aligned. Case and NFC/NFD tests verify both copy directions and backup spelling; a baseline regression fails with the old guards removed. Full automatic name-policy matching remains open and requires shared tree/operation mappings, as recorded in filename-matching-design.md.

2.127.1 final validation: 1032 units pass with one Windows-only skip. Source and both Mac packages pass actual case/NFC/NFD names, single/modifier selection, context alignment, double-click contents, bidirectional copy spellings and closed-node exclusion. Existing filename UI workflow passes. All three ZIPs, packaged assets, download checks and shipped branding verified. Windows execution and automatic tree name-policy implementation remain open.

## 2.128.0 — Automatic tree name policies

Opt-in ignore-case and Unicode-equivalence pairing is implemented as a shared PathNameMatching model, preserving exact/manual priority and leaving ambiguous names unpaired. Browsing remains node-scoped; operation namespaces include unopened descendants without unrelated content reads. Policies are independent of saved manual alignments. Staged tree publication and frozen policy objects prevent failed scans or in-memory mutation changing preview authority. Source native workflow and 1062 units pass (one Windows-only skip); final package checks in progress.

2.128.0 final validation: 1062 units pass with one Windows-only skip. Final source and both Mac packages pass actual case/Unicode pairing, unopened nested copies, both directions, selection/double-click, rapid policies, report/default/session/swap retention and opt-out. Light/dark dialogs inspected. Intel test-only teardown was corrected after its workflow passed and the busy quit guard prevented cleanup; final Intel rerun exits0. All three ZIPs, packaged modules/renderer, download checks and shipped branding pass. Windows execution, extension pairing and broader full-product work remain open.


## 2.129.0 extension pairing verification

Filename Matching options now support optional final-extension file pairing, after exact and case/Unicode full-name matches. Unique unmatched file stems pair; directories and ambiguity remain separate. Native and context routes, lazy expansion, unopened-directory copy to actual names, backups, click selection/double-click opening, reports, defaults, saved sessions, swaps and opt-out passed on source and both Mac packages. Full suite: 1,074 passed, one Windows-only skip. All package/archive/download gates passed. Windows runtime and remaining full-product work remain outstanding.


## 2.130.0 filename comparison criterion

Direct reference inspection of Session Settings > Comparison showed Compare filename case separately from extension/Unicode alignment. Further Compare adds the explicitly broader optional Compare filename spelling criterion for actual basenames (case, Unicode representation and extension), independent of pairing policy. The reference settings dialog was cancelled without changes.

Verified filename-only differences retain underlying content results; renamed parent folders do not flag identical child names. Live nodes, selected rows, manual/flat matching and unopened operation inventory all receive actual endpoint paths. Windows permits this criterion independently of Unix checks. 1,082 unit tests passed with one Windows-only skip. Source and both Mac packages passed native flows and reusable defaults; input names/bytes remained unchanged. Both themes inspected; all ZIPs, final packaged assets, download checks and branding checks passed. Actual Windows runtime and full product scope remain open.


## 2.130.1 options density

Fixed numeric-input sizing leaking into comparison checkboxes and reduced section/explanation spacing. Opening the options dialog restores heading visibility and close-button focus, while specific native setting routes retain targeted focus. Source and both Mac packages pass 1440x928, 1024x768 and 800x600 options/selection/expansion workflows; both themes inspected. Intel initially waited at quit after passing assertions; normal quit retry completed, deterministic disposable-test cleanup and a fresh Intel run passed. All packages/assets/downloads/branding gates passed. Screenshot review also identifies further room to consolidate stacked folder toolbar rows: first entry currently starts at y268. Full scope and Windows execution remain outstanding.


## 2.131.0 folder workspace density

Consolidated filter/expansion commands, moved per-side Copy/Delete into navigation, removed redundant pane headers, and set sticky columns to top0. Original IDs/handlers preserved; include/exclude/select remain visible. Color legend moved to visible status bar, with its existing toggle preserved. First entry y208 at1440x928 versus previous268. Both themes inspected. Source responsive/path-navigation/page-selection/busy-action and browser-text workflows passed; both final Mac packages passed responsive options and interactions. All ZIPs/assets/downloads/branding verified. Two older test expectations were updated for existing text-options filter placement and file-operation scope wording. Actual Windows execution and remaining full-product scope remain open.


## 2.132.0 complete settings access and dispatch repair

Added full Filters & options overview through context View and native View menus, including preload allowlist routing. Audit reproduced a2.131.0 regression: moved toolbar button became disabled during queued command dispatch, causing synthetic clicks from settings menus to do nothing. Exposed direct dialog open API, routed all settings shortcuts through it, and deferred target focus until dispatch completes. Windows metadata focus uses the available filename criterion.

Source full menu inventory/keyboard/multiselection/edge-placement audit and filename/time-exception/automatic-refresh/Unix-metadata workflows pass. Both final Mac packages pass full context/native overview audit with focus/selection restoration. All ZIPs/native menu+preload/final assets/downloads/branding verified. Actual Windows runtime and full-product scope remain open.

## 2.134.0 selective whitespace rules

The reference's [Importance settings](https://www.scootersoftware.com/v5help/sessiontextimportance.html) document independent leading, embedded and trailing whitespace significance. Current source inspection confirmed our previous text/folder rules only offered broad normalization. The installed folder settings were opened for inspection and dismissed with Escape without applying changes.

A shared normalizer now supports all location combinations in text and normalized folder comparisons, preserving original text and physical line boundaries. Folder child sessions inherit the rule; caches, captured operation snapshots, reports, sessions, reusable defaults, CLI and batch jobs retain it. This addresses location-specific whitespace; grammar-defined unimportance and orphan-line suppression remain open. Source browser/native matrices and 1099 units pass with one platform-specific skip. Both final Mac packages passed the scope workflow. All three ZIPs, packaged modules/assets, downloads and branding checks passed; actual Windows runtime remains pending.

## 2.135.0 optional blank lines

Text and normalized folder comparison now offer optional empty/spaces-tabs-only line suppression. Original ignored rows retain their actual coordinates and optional minor highlighting; explicit manual alignment overrides suppression. Final newline after nonblank text remains substantive. Merge hunks exclude internal ignored blanks, with a documented exception for empty trailing separators when removing the final newline. Grammar-defined unimportant orphan lines remain separate work.

Source tests cover folder caches/provenance, closed nodes, child inheritance, reports, sessions/defaults, CLI/batch, exact-byte copies, actual native merges and synchronized scrolling. 1117 units pass with one platform-specific skip; independent properties include 700 bidirectional merge cases. Both final Mac packages pass, including actual EOF/mixed-blank merges after correcting the test worker-completion wait. All three archives/modules/assets/downloads/branding checks pass. Windows runtime remains open.

## 2.136.0 ignored-text patterns

Added bounded per-comparison Unicode regex patterns to text and normalized folder options, with original-line span union and original content/structure retained. Native worker pooling and browser/report watchdogs prevent unbounded regex work on UI/main threads. Cache provenance, child inheritance, sessions/defaults, reports and CLI/batch preserve rules. 1140 units pass with one platform-specific skip; source workflows include actual timeout/recovery and real selected-file report workers. Both final Mac packages pass extended folder/report workflows. All ZIPs/modules/assets/downloads/branding verified. Grammar/file-format profiles and actual Windows runtime remain open.

## 2.137.0 archive permissions

Source inspection exposed discarded archive modes through in-memory edits and exports. Ordinary POSIX rwx bits now survive known Unix ZIP/TAR metadata, native Unix imports, copies/renames/child writeback and ZIP/TAR/gzip exports. Explicit000 differs from unknown defaults0644/0755; special bits/ownership remain omitted. This does not change extraction permissions. 1152 units pass with one platform skip; independent Python interoperability and both final Mac import/export workflows pass. ZIP/assets/downloads/branding verified. Windows runtime and broader metadata preservation remain open.

## 2.138.0 MP3 folder routing and audio comparison

MP3 entries now route to Audio Compare on double-click and shell requests; single click remains selection. Standard MPEG Layer III decoding retains original rates and compares lossy decoded samples, clearly labeled in metadata/reports. Original compressed bytes survive sessions. Real original-tone fixtures, malformed replacement retention, reports, sessions and folder routing pass source and both final Mac packages. 1160 units pass with one platform skip; all ZIP/assets/downloads/branding checks pass. Actual Windows runtime, additional formats and full-product scope remain open.
