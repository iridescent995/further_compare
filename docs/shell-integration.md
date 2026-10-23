# File-manager integration

The desktop launch commands support a two-step file or folder comparison: **Set as Left**, then **Compare with Left** on another item of the same type. Install the app in a stable location before registering these shortcuts. Moving the app requires rerunning the installer with its new path. These scripts do not run automatically during builds or app startup.

## Enable from the app

In a packaged Mac or Windows app, open **File → File Manager Integration…** and choose **Enable integration**. The same dialog can remove the integration or repair an incomplete, stale or damaged owned registration. Status validates the complete generated Finder service metadata and actions. If macOS cannot refresh its Services database, the dialog reports the failure and offers an activation or removal retry; this pending failure survives reopening the dialog in the same app window. Installed files do not prove Finder menu discovery. Builds and startup never enable it automatically. The app displays the remembered filename; **Set current left** uses the active text session’s on-disk left file, and **Clear** forgets it. Unsaved editor content is not used by file-manager comparisons; the selected files are read from disk.

The command-line installers below are alternatives for development or managed deployment.

Status checks validate the generated menu metadata and the target executable. A moved, deleted or non-executable Mac target, or damaged Explorer menu metadata, is reported as needing repair. Run repair from the app in its permanent location.

New Finder workflows are fully written under a hidden staging name before an exclusive rename makes them visible. A failed install cannot replace an unrelated destination or leave an incomplete visible workflow that blocks retrying. An interrupted operation may leave a hidden staging folder; the reported path identifies it. Development use requires `npm run build:native` before generating new Mac workflows.

## Windows

Run PowerShell as the current user, without administrator privileges:

```powershell
& .\scripts\shell-windows.ps1 -AppPath 'C:\Users\you\Apps\Further Compare\Further Compare.exe'
```

This adds **Further Compare → Set as Left / Compare with Left / Clear Left Selection** for files and folders. Windows 11 normally places this classic Explorer submenu under **Show more options**. Labels are static; the simple registry integration cannot change the label to the remembered filename or conditionally hide Compare with Left. The application handles missing selections. A modern Windows 11 menu and dynamic labels require a separately packaged native extension.

Preview registry changes with `-WhatIf`. Remove only this integration:

```powershell
& .\scripts\shell-windows.ps1 -Uninstall
```

Registration is restricted to `HKCU\Software\Classes\*\shell\FurtherCompare` and `HKCU\Software\Classes\Directory\shell\FurtherCompare`. All destinations are checked before changes. The script refuses to overwrite or remove a key without its ownership marker. It does not change file associations or machine-wide settings. Select one file or folder; this registration does not add a two-file selection action.

## macOS

Generate Finder Quick Actions into a staging directory first:

```sh
node scripts/shell-macos.mjs --app '/Applications/Further Compare.app' --output '/tmp/further-compare-services'
```

With no `--output`, the staging directory is `release/finder-services`. To explicitly install for the current user:

```sh
node scripts/shell-macos.mjs --app '/Applications/Further Compare.app' --install
```

The three `.workflow` bundles are written to `~/Library/Services`. In Finder, right-click one file or folder and look under **Quick Actions** or **Services** for **Further Compare — Set as Left** and **Further Compare — Compare with Left**. macOS may require enabling them in System Settings → Keyboard → Keyboard Shortcuts → Services; placement and enablement vary by macOS release. Labels are fixed and do not include the remembered file name. Set as Left and Compare with Left accept exactly one regular file or directory. Compare Selected accepts exactly two files or two folders and opens an order review showing both paths; choose Compare, Swap and Compare, or Cancel. Paths are passed as separate arguments, preserving spaces and shell metacharacters. The `open -n` invocation forwards the request through the app's single-instance routing even when Further Compare is already running.

Remove only these generated actions:

```sh
node scripts/shell-macos.mjs --install --uninstall
```

For a staging folder, use `--output '/tmp/further-compare-services' --uninstall`. Uninstall refuses unrelated or symlinked workflows. No Finder extension, root privileges, file association changes, or login items are required. This implementation does not add dynamic Finder menus. Compare Selected supports a pair; larger selections are rejected.

## Verification limits

Actual Finder menu discovery and all three file/folder workflows have now passed on this Mac using installed 2.177.0. This includes selected-pair order review, swapping sides, preserving existing tabs and unchanged fixture contents. See [the scoped runtime audit](finder-runtime-validation-2.178.md). The installed app was subsequently updated to 2.178.0; both 2.178 Mac packages separately passed isolated installer/helper checks.

The generated property lists are checked with macOS `plutil`; their service metadata and Run Shell Script action identifiers/parameters are based on the installed system Automator components. Automated tests check safe quoting, single-item validation, staged generation, repeated installation, ownership checks and removal. The additional `node test/shell-macos-workflow.cjs` integration check executes the staged workflows through `/usr/bin/automator` and a temporary app, verifying literal arguments containing spaces and shell metacharacters. This has passed on macOS. These checks do not prove Finder discovers an installed service, or that Explorer renders the Windows submenu. Perform those checks on the target operating system before describing integration as runtime verified. The automated fixture tests do not install into the user's actual Services folder or Windows registry; the separate manual Finder audit used the explicitly installed user services.

## Launch commands

The packaged executable accepts `--fc-set-left ABSOLUTE_PATH`, `--fc-compare-left ABSOLUTE_PATH`, `--fc-clear-left`, `--fc-compare ABSOLUTE_LEFT ABSOLUTE_RIGHT`, and `--fc-compare-selected ABSOLUTE_ITEM ABSOLUTE_ITEM`. The selected-pair command requires an order review; cancelling preserves the active session and remembered selection. Arguments are passed as separate values, without shell evaluation. A running app receives requests through the single-instance channel; a closed app processes them after initialization. Missing selections or files produce an error without replacing current tabs. The remembered left path is stored per account in the application's user-data directory, separately from saved comparison sessions.

Folder requests validate both roots before changing the active comparison. They open a new Folder Compare tab and preserve existing unsaved sessions. File/folder pairs and overlapping folder roots are rejected. Remembered selections retain their type; a file replaced by a directory (or vice versa) must be selected again. Version1 remembered-file selections remain supported.


## Bundled native Finder extension

The source in `desktop/native/finder-sync` supplies Finder item-context menus for
one file/folder or a selected pair. Mac packaging embeds the universal extension
in `Contents/PlugIns` and signs nested code inside-out for the current local
ad-hoc distribution. Windows packaging skips this hook. Neither packaging nor
startup enables the extension. The standalone
`node scripts/build-finder-extension.mjs` command remains available for development.

In a packaged Mac app, **File → File Manager Integration** offers a separate
**Native Finder menu** section with Enable, Disable, and Refresh status controls.
The Services fallback remains separately manageable. Status checks are read-only.
Enablement verifies the bundled extension, registers the exact containing app and
extension, and requests the macOS election. Disablement first requests disabling
and then unregisters the exact extension; macOS may rediscover a bundled extension
while retaining its disabled election. Duplicate registered app copies prevent
changes because macOS elections apply to the shared extension identifier.
A verified enabled election does not prove Finder has loaded or displayed a menu.
If verification fails, mutation controls remain disabled until a fresh check succeeds.

The extension retains immutable selection snapshots behind one-shot menu tags,
so invoking a menu cannot accidentally use a later selection. It sends structured
requests to its containing app through the `furthercompare://shell/v1` URL route.
The host strictly validates the route, canonical base64url JSON, command, path
count, and absolute path syntax. Since another application or website can invoke
a public URL scheme, the host asks for confirmation **before filesystem access or
remembered-selection changes**. Cancel leaves the remembered left selection
unchanged. Selected pairs then receive the existing side-order review.

Actual Finder registration, menu discovery, Set as Left launch, request
cancellation, and selected-pair comparison have passed in an isolated local
probe. The selected pair showed both URL approval and side-order review, then
opened a new tab with the expected contents while preserving the original tab.
Both 2.186 Mac packages now contain the extension and passed signature, source,
and ZIP checks. An isolated copy of the final ARM64 package passed production
backend enable/status/disable/unregister checks, and its actual Finder Set as
Left command showed approval and loaded the expected file. Cleanup confirmed
the host had exited and removed the isolated profile and registration.
A second isolated production probe passed actual Finder file/folder Compare
with Left, selected-folder pair review and swapping, and the dialog's live
disable/re-enable controls. Existing tabs, the remembered left file, and all five
fixture files were preserved. Both probes were cleaned up without leaving
registrations. Version 2.187 is now installed locally, with the prior 2.185 app
retained as a backup. Its isolated installed-app smoke check passed and existing
Services fallback registration remains healthy. Native activation stays opt-in.

The isolated tests placed user data under Desktop and re-signed their staged
hosts. macOS requested Desktop access for the changed code identity. In the
second delayed run, system logs show the prompt at 16:10:58.021 and its access
event at 16:11:24.781, immediately before renderer launch at 16:11:24.794.
The 27-second wait was therefore consistent with OS permission handling, not
shortcut loading. Three direct source launches were ready in 256–271 milliseconds.
Future probes should keep isolated user data under the temporary directory and
respect any native file-access permission prompts. Do not change TCC permissions
or bypass macOS protections to accelerate tests.

The expanded URL event integration test passed against source and both final Mac
packages. It covers file and folder set-left/compare-left, pair order swapping
and cancellation, changed/equal folder results, wrong-kind rejection, and
preservation of unsaved tabs, remembered selection, and fixture bytes. These
automated event tests complement the actual Finder menu checks above.

Without an authorized shared app group, menu labels remain generic; the host
resolves the remembered left selection. Contextual filename hints require a
separately entitled shared-state publisher. Ad-hoc local activation does not prove
Developer ID distribution, notarization, or app-group authorization. Windows
runtime testing is deferred by user; Windows build/static checks remain required.
