# Further Compare 2.56.7

Desktop left/right Open buttons remain available during operations and queue their requests using the existing session-aware idle queue. They now share the behavior of native menu Open commands. A request waits for the current picker or folder refresh instead of being unavailable during that operation. Browser busy controls retain their existing disabled behavior.

The new folder-open-queue desktop regression holds a real picker, requests the opposite side and verifies that both roots load in order. It also holds folder refreshes and verifies queued requests on both sides, with cancelled pickers preserving both roots. The previous package fails because Open is disabled while the first picker is held. The regression is included in desktop CI.

The source regression and busy-tab navigation suite passed. Both packaged Mac architectures passed the queued Open regression. All three package versions and application bundles match the source build, and ZIP integrity checks passed. Windows runtime testing remains unavailable on this Mac.
