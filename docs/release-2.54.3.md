# Further Compare 2.54.3

Folder pane copy buttons, main-toolbar/native copy commands and the merge/sync Review changes button now use the folder-action queue. A click during an active folder operation waits for it to finish instead of disappearing. Changes to the captured folder context, selection or direction invalidate the queued action. File writes still require the existing preview and apply flow.

Validation: held-refresh tests cover both pane copy buttons, both main-toolbar directions and both native copy commands; each opens a correctly directed preview only after release. Changing selection while waiting rejects the preview. Merge and sync Review changes also wait correctly and reject changed directions. Cancelling previews leaves all fixture contents unchanged. The new copy regression fails against the previous 2.54.2 package and passes in source and both rebuilt Mac packages. Existing busy context actions, row activation, cancellation and immediate expansion stop continue to pass.

All package versions and UI bundles matched the build; ZIP integrity checks passed for Apple Silicon, Intel Mac and Windows. Windows runtime verification remains pending.
