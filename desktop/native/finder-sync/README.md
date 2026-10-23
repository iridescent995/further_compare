# Finder contextual-menu extension foundation

`FCFinderSync` captures Finder's selection while building an item context menu.
Each action carries a unique numeric tag referencing an immutable request snapshot
held in the extension. Dispatch does not depend on a reconstructed menu item's
`representedObject` or `enabled` property. The bounded store retains 128 recent
enabled actions; tags are consumed once and never reused, so an evicted menu
fails closed instead of opening a later selection. One file or folder offers Set as
Left and Compare with Left; exactly two of the same kind offer Compare Selected.
Mixed, symbolic-link, special-file, and larger selections are not dispatched.
The host revalidates all paths; native menu metadata is not an authorization.

The extension monitors `/` only to supply contextual menus. It does not enumerate
directories, scan file contents, or add badges. Container/sidebar/toolbar menus
are deliberately absent because they do not represent the requested file selection.

Dispatch targets the containing `com.furthercompare.desktop` application using
`NSWorkspace.openURLs:withApplicationAtURL:configuration:completionHandler:`.
The extension identifies its own bundle through its principal class and derives
only its enclosing `.app` through the exact `Contents/PlugIns/*.appex` hierarchy,
requiring its own expected extension identifier. It never chooses another copy
or a default protocol handler. This provides fixed containing-app targeting, not
independent host identity or signature attestation; packaging verifies the host
identifier and signed distribution must validate the enclosing bundle. Reading
host metadata can be sandbox-denied, and a movable or temporary app need not
appear in LaunchServices' registered application list.
The URL is `furthercompare://shell/v1?payload=…`, where payload is unpadded base64url
UTF-8 JSON containing `command` and `files`. The maximum encoded URL is 96 KiB.
No shell, AppleScript, or command-string interpolation is involved. The host must
review every URL request before reading or changing comparison state because
other applications and websites can invoke this public URL scheme.

Do not replace this with `NSWorkspaceOpenConfiguration.arguments`: the installed
SDK explicitly documents that sandboxed callers' arguments are ignored.

If the build supplies `FCAppGroupIdentifier` and a matching signed group
entitlement, the extension may read `finder-left-state.json` from that group.
The bounded JSON schema is `{version:1,name:string,kind:"file"|"folder",available:boolean}`.
It contains display metadata only, never a path or access grant. Without a valid
hint, Compare with Left uses its generic name and lets the host resolve state.
No Electron user-data location is assumed. The containing application must
publish this optional hint atomically and hold the same authorized group entitlement.

`MenuPolicy.m` is Foundation-only so the actual menu decisions, immutable request
capture, and transport serialization can be exercised without registering the extension.
`FinderSync.m` requires Foundation, AppKit, and FinderSync, ARC, and
`-fapplication-extension`. The principal class is `FCFinderSync`.

The source and compile checks do not prove signed Finder operation. Production
integration still needs a correctly signed enclosing application and extension,
appropriate entitlements/provisioning, user-controlled extension enablement, and
real Finder validation. Nothing in these sources registers or enables an extension.

References:
- [Apple Finder Sync guide](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/Finder.html)
- [Apple selectedItemURLs](https://developer.apple.com/documentation/findersync/fifindersynccontroller/selecteditemurls%28%29)
- Installed SDK `AppKit.framework/Headers/NSWorkspace.h`, `arguments` property documentation.
