# Further Compare 2.37.1

Choosing Open Left or Open Right from the native menu during background folder refresh now waits for that refresh and opens the picker exactly once. Previously, the command could silently disappear. A queued command is discarded if its originating session changes; cancelling the picker preserves the current folders.

The regression test holds a real folder-tree request, sends each native Open command, and checks that the picker appears once after release. It failed before the fix and passed afterward. Existing busy-refresh context actions, double-click and Enter activation, stale-selection cancellation, inline expansion and immediate Stop checks also passed in source.

Both packaged Mac architectures passed the held-refresh regression, including exactly-once native Open Left/Right pickers, queued context actions, double-click/Enter, stale-selection cancellation, inline tree expansion and immediate Stop. All three archives passed ZIP integrity and version 2.37.1 plus 52 source/resource checks. Windows runtime remains unverified.

Download links, sizes, SHA-256 and the Windows ZIP browser download passed.
