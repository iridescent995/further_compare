# Further Compare 2.39.1

Folder path search now stays with its session, alongside include and exclude patterns. Returning from a child file comparison and reopening a saved session preserve the filtered view. Previously, the path search was cleared during tab restoration and omitted from saved sessions.

Typing in the toolbar search marks the session as changed. Fresh sessions start with an empty search, and older sessions without the optional field remain compatible. Search text is limited to 4,096 characters; invalid types and null characters are rejected by session validation.

The native regression failed before the fix and passed afterward for child/parent restoration, fresh-session isolation, dirty tracking, saving/reopening and filtered rows. All 426 unit tests passed. 426 unit tests passed. Both packaged Mac architectures passed folder-filter session persistence and grouped context-menu suites. All three archives passed ZIP integrity, version 2.39.1 and 52 source/resource checks. Download links, sizes, SHA-256 and Windows ZIP browser download passed. Windows runtime remains unverified.
