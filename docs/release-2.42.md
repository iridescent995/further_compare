# Further Compare 2.42.0

Timestamp tolerance can now be edited from the folder right-click **Compare** menu and native **View > Folder Comparison** menu. The dialog shares the existing toolbar setting and accepts 0–86400 seconds in millisecond increments. It explains that tolerance applies to modified-time comparison modes and does not verify contents or change file timestamps.

Apply rescans with the existing comparison rules. Cancel and Escape preserve the previous setting and return focus. The setting remains part of saved sessions. Both light and dark dialog rendering were inspected.

Source folder-rule tests passed validation, precision, comparison colors, cancellation, native/context commands, recursive rescans, saved rules and tab isolation. Both packaged Mac architectures passed the updated folder-rules suite. All three archives passed ZIP integrity and version/source checks. Download links, sizes, SHA-256 and an actual Windows ZIP browser download passed. Windows runtime verification remains pending. A separate busy-tab click issue remains recorded for follow-up.
