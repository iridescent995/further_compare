# Further Compare 2.62.3

Native Copy paths and Delete selected now work when files remain selected but keyboard focus is on the folder pane rather than a row. These selection-based actions previously returned early because there was no focused row. Single-entry actions retain their existing selection and focus checks.

The regression reproduced Copy paths silently producing no clipboard write before the fix. It now exercises both panes with two selected files, verifies their actual copied paths, opens and cancels the correct delete preview, and confirms files are unchanged. The existing side-specific context test runs in desktop CI.

Source checks passed for side-specific menus, commands queued during pending I/O, direction menus and file selection. The busy-operation test now observes aria-busy rather than using Open-button enablement as a proxy; desktop Open commands deliberately remain available to queue requests. Its injected held I/O is isolated from periodic background refresh.

Both packaged Mac architectures passed the expanded side-context regression. All three package versions and app bundles match source, and ZIP integrity checks passed. Windows is cross-built and runtime-unverified.
