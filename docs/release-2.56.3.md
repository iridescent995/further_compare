# Further Compare 2.56.3

Folder context menus support typing to focus an enabled action by name, including names containing spaces. Repeated initials cycle through matching enabled actions; typing does not execute commands. After 800 ms of inactivity, the next character starts a fresh search. Arrow/Home/End navigation clears the search. Standalone Space and Enter retain normal button activation.

The folder context-menu desktop regression covers prefix search, repeated initials, disabled-action skipping, multi-word names and no action execution during typing, alongside the existing selection, focus, submenu, filtering and light/dark viewport checks.

Both packaged Mac architectures passed the folder context-menu regression. All three desktop packages contain the matching version and application bundle, and all ZIP archives passed integrity checks. Windows runtime testing remains unavailable on this Mac.
