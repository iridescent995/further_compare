# Version 2.167.0

File-manager Set as Left / Compare with Left now accepts folders as well as files. Folder comparisons open in a new tab; existing unsaved comparisons remain open. Mixed file/folder pairs, unavailable selections and overlapping roots are rejected before changing the active native session. Remembered selection types survive restart, with compatibility for existing file selections.

Finder workflows accept regular files and directories; old file-only workflows are detected as stale for repair. Classic Explorer registration includes both file and directory contexts, preflighting ownership of all destinations before changes. Enable or repair through File Manager Integration after putting the app in a stable location.

Actual Finder menu discovery, native dynamic labels, multi-selection and the modern Windows11 extension remain separate work. Windows runtime testing is deferred at the user’s request.

Validation: source and both Mac packaged cold/second-instance folder tests passed, including unsaved-tab preservation and invalid/overlapping roots. Staged Automator workflows and 17 service/installer units passed. All three packages passed static checks; download links, sizes and SHA-256 checks passed.
