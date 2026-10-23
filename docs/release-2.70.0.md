# Further Compare 2.70.0

The folder workspace now offers Always show folders in its toolbar, right-click View menu and native View menu. It keeps paired and one-sided directory rows visible across comparison-status filters. Filename/path exclusions and path-search queries still apply. File rows keep their normal status and mask filtering.

The preference belongs to the comparison and is serialized in folderView.alwaysShowFolders. Existing sessions default to normal visibility. Turning it on does not traverse or compare unopened descendants, and it does not change file-operation eligibility. Flat and recursive file-only views retain their existing scope. Reports record the effective folder-visibility preference.

Unit coverage includes paired/one-sided directories, status filters, actual aligned endpoint exclusions, queries, unchanged files/statuses, saved-option validation, and report metadata. The native desktop regression passes toolbar/context/native routes, per-tab state, saved restore, and zero folder read requests. Both final Mac packages passed the extended regression, including an empty copy preview for a visible folder whose contents do not match. All 545 unit tests and the browser regression pass. All three package versions, changed modules/renderers, ZIP integrity and download hashes were verified. Windows runtime acceptance remains pending.

This addresses explicit always-show-folder behavior. Other folder-display modes and structure-independent matching remain open.
