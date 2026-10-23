# Further Compare 2.60.0

Drag a folder from the file manager onto either folder pane or its path field to open it on that side of the current comparison. A dashed highlight identifies the drop target. The other root and tab are retained, normal folder history is updated, and comparison uses the existing node-local engine. Drops wait for in-flight operations through the same queue as Open.

The preload resolves OS-backed File objects using Electron webUtils.getPathForFile; navigation uses the existing validated native folder path operation. One folder per drop is accepted. Regular files and multiple-item drops leave both roots unchanged. Browser text-file drop behavior is unchanged.

The native regression uses Chromium drag events with real directory paths. It verifies pane and path-field routing, root replacement, no extra tab, Back history, rejected file/multiple drops, highlight cleanup, synthetic File rejection and two ordered drops while navigation is held. Existing folder-navigation tests also passed. The new regression is included in desktop CI.

Both packaged Mac architectures passed the directory-drag regression, and the target highlight was visually reviewed. All three package versions and drop resources match source; ZIP integrity checks passed. Windows is cross-built but runtime-unverified. A manual Finder drag remains unverified while the desktop is locked; automated tests use real OS-backed directory File objects delivered by Chromium drag events.
