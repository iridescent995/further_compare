# Release 2.121.1 — Protect queued work when closing a window

A native request could be accepted from one window but still be waiting behind another window in the shared operation queue. The close guard only counted running handlers, so closing the waiting window could reject its request before it started. A gated regression reproduced this with a persistent history append: the window closed while its save was still queued.

The native dispatcher now counts accepted queued and running requests per window. Close and quit guards include that count, and a finally handler releases it on success or failure. This extends the existing close protection to waiting requests. The window can be closed once its pending work completes; it is not automatically closed afterward.

Source regression verifies both records persist, an immediate IPC acknowledgement establishes that the request has arrived, and a rejected queued request also releases the guard. Existing multiwindow isolation and persistent-history restart workflows pass.

Both packaged Mac architectures pass the gated regression. The full unit suite passes 973 tests with one Windows-only skip. All three release ZIPs pass integrity checks, and versions, main-process code and renderer/CSS assets match source. Download sizes, SHA-256 and the Windows browser download pass; shipped branding checks pass. Windows runtime and full-product scope remain open.
