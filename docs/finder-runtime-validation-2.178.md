# Finder runtime validation — 2.178 release audit

Verified on 22 October 2026 using the real unlocked macOS Finder and native application UI through CUA. The installed application used for this runtime check was **2.177.0** at `/Users/harshit/Applications/Further Compare.app`; it was deliberately kept unchanged while 2.178 was built separately. This evidence verifies the installed Services workflow, not new 2.178 installer behavior.

Before installation, `~/Library/Services` was empty and Finder had no Further Compare entries. After installation and Services refresh, actual file and folder context menus under **Services** displayed all three entries:

- Further Compare — Set as Left
- Further Compare — Compare with Left
- Further Compare — Compare Selected

## Invocations verified

Fixtures were isolated under `/private/tmp/fc-finder-discovery2177`.

1. File `left.txt` → Set as Left opened a new text tab with the full left path and the expected `Finder verification` / `left content` text; the right pane was empty.
2. File `right.txt` → Compare with Left opened another tab with `left.txt` on the left and `right.txt` on the right. Both original contents appeared, with one changed line (+1/−1). The first tab remained open.
3. Command-click selected both files. Compare Selected displayed a native order-review dialog with `right.txt` left and `left.txt` right, reflecting Finder's supplied order. **Swap and Compare** opened another tab in the requested left.txt/right.txt order and preserved earlier tabs.
4. Command-click selected both folders. Their context menu exposed all three services. Compare Selected displayed a native order-review dialog with `right-folder` left and `left-folder` right. **Compare** opened that exact order in Folder Compare. `sample.txt` was marked changed on both sides, sizes 13 and 12 bytes.
5. Single folder `left-folder` → Set as Left opened a new folder tab with only the left root. Folder `right-folder` → Compare with Left opened another folder tab with the correct left-folder/right-folder roots; `sample.txt` was marked changed, sizes 12 and 13 bytes. Earlier tabs remained open.

Native accessibility trees and inline screenshots in the audit conversation show the order dialogs and resulting folder comparison. No screenshot file was persisted by this agent.

## Cleanup and safety

Text Filters & options → File manager showed the remembered `left-folder`. Clear changed it to **None selected** and disabled the Clear button. All six open tabs were created by these fixture invocations. They were closed using the session-discard prompts; no file edits had been made. The app then displayed its launch screen with no tabs. Command-Q quit it, and an exact installed-executable `pgrep` returned exit 1 with no matching process.

All four fixture contents were checked unchanged after testing:

- `left.txt`: `Finder verification\nleft content\n`
- `right.txt`: `Finder verification\nright content\n`
- `left-folder/sample.txt`: `left-folder\n`
- `right-folder/sample.txt`: `right-folder\n`

Fixtures were retained. No user file contents were opened or changed during the invocation tests; no pre-existing user tab was discarded. This does not prove Windows runtime behavior, modern dynamic Finder extensions, every macOS version, or file-type-specific invocation outside the text/folder fixtures. Windows runtime testing remains explicitly deferred by the user.
