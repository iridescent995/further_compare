# Further Compare 2.56.2

Archive context menus support Up/Down (including wraparound), Home/End, Escape and Tab. Navigation skips disabled actions. Escape and action activation restore focus to the selected archive entry. Shift+F10 or the context-menu key opens the menu from a focused entry. Clicking outside dismisses it without stealing focus back from the clicked control.

The archive save desktop regression covers keyboard navigation, disabled-action skipping, focus restoration, keyboard invocation and activation, outside dismissal, viewport edges, exact saved bytes and unchanged source archives. Archive asynchronous replacement/reset/save tests also pass.

Both packaged Mac architectures passed the archive save/context-menu regression. Mac ARM64, Mac x64 and Windows x64 package versions and application bundles match the source build. All three ZIP archives passed integrity checks. Windows runtime testing remains unavailable on this Mac.
