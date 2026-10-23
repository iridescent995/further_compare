# Further Compare 2.46.0

Type a filename prefix while a folder row is focused to select a matching visible entry. Repeat a single letter to cycle through matches, wrapping at the end of the list. A one-second pause or mouse selection starts a new prefix. Matching is case-insensitive and normalizes Unicode names.

Navigation uses the focused pane, skips missing-side placeholders and respects filters. It selects without opening a file, changing a filter or adding a comparison tab. Ctrl/Command shortcuts and Space selection retain their existing behavior.

The regression check covers prefixes, cycling, both panes, missing-side entries, modifier shortcuts, Unicode, timeout, mouse reset, filtered entries and no file opening. It is included in the desktop CI workflow.

Validated in the final Apple Silicon and Intel Mac packages. Existing selection and page-navigation checks passed. All three packages matched source and passed archive and download verification. Windows runtime testing remains pending.
