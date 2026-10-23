# Further Compare 2.62.4

Folder panes now handle selection and navigation shortcuts while the pane itself has focus, such as after dismissing an empty-area context menu. Ctrl/Command+A selects the visible entries on that side. Down/Home focuses the first real entry; Up/End focuses the last. Ctrl/Command navigation preserves selection, and Shift navigation uses the existing range-selection behavior. Delete/Backspace opens the selected entries’ existing delete preview.

Missing-side placeholders are never selected or focused as real files. Empty and filtered-out panes keep focus and produce no delete preview. Row keyboard handlers remain separate, so events from a focused row do not run twice.

The expanded pane-focus regression reproduced Select All leaving the selection empty before the fix. Source checks pass for both pane shortcuts, missing and empty panes, delete-preview cancellation, unchanged files, existing row selection and native selection actions. The regression is already included in desktop CI.

Both packaged Mac architectures passed the expanded pane-focus regression. All three package versions and bundles match source; ZIP integrity and download link, size, SHA-256 and Windows ZIP browser-download checks passed. Windows runtime remains unverified.
