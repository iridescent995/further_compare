# Further Compare 2.72.2

When an aligned file is replaced on disk by a directory, the row remains an explicit alignment conflict. Its disclosure button and right-click expansion commands are now disabled. Arrow-right skips expansion of that row. Native subtree expansion rejects the stale mapping before directory I/O and explains how to recover by clearing alignment.

The regression replaces both aligned files with real directories, refreshes the tree, checks both panes and context commands, observes IPC to prove no conflicting directory is listed, then clears alignment and verifies the new child becomes accessible. Normal subtree/all expansion, isolated collapse, stopping delayed I/O and session switching also passed source regression checks.

Full product parity and native Windows runtime verification remain incomplete. Both final Mac packages passed the extended tree regression. All three package versions and UI bundles match source; ZIP integrity, local download links, sizes and SHA-256 passed.
