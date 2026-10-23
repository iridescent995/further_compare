# Further Compare 2.71.0

Close Other Sessions is available from the Session menu and from any tab's right-click menu. The clicked tab is kept even when it is in the background. Shift+F10 opens the tab menu; Close other sessions is disabled when there is only one tab.

Unsaved sessions use the existing Save/Discard/Cancel flow. Cancel stops the batch; the chosen tab is restored with its contents intact. Save completes before closing. Requests wait for an active operation and revalidate the target before closing tabs.

The folder right-click root had grown beyond its compactness limit after recent additions. Align selected pair and Clear alignment now live in the existing Compare submenu. The compare-mode root stays within 22 items, and the grouped-menu regression passes. A subsequent audit found merge/sync still had 23 items; that is corrected in 2.71.1.

Source verification: new browser and Electron tests exercise background targets, keyboard menus, cancellation, save/discard, preserved contents and a queued desktop request during a held file chooser. The existing grouped-folder-menu regression passes, including keyboard/focus/edge-placement checks in both themes. Both final Mac packages passed the new session workflow. All three package versions, changed modules/renderers, ZIP integrity and download sizes/hashes were verified.

Windows runtime verification and full product parity remain incomplete.
