# Further Compare 2.16

Light **Prism** replaces the blue palette with warm ivory surfaces and violet, teal, coral, rose and amber accents. Dark **Aurora** uses charcoal/plum surfaces with brighter versions of the same colors. Existing Light, Dark and Follow system preferences retain their behavior and automatically use the new palettes.

Session cards have distinct colors, navigation icons use grouped accents, tabs gain color markers, and left/right paths have teal/rose borders. Subtle gradients run across the session header. Document backgrounds remain solid, with distinct semantic colors for differences, additions, deletions, one-sided entries and metadata matches. The shared theme stylesheet applies to the browser and all desktop builds.

Display-preference regression checks pass, including persistence, system theme switching, compact/comfortable row heights, paired panes, dialog focus and mobile width. Desktop light/dark launch and comparison screens were visually inspected. The eight core text/background pairs (body, muted, selected and comparison states) have calculated contrast ratios of at least 4.9:1 in light and 6.8:1 in dark. Windows runtime verification remains pending.

The final Apple Silicon package was opened to inspect both palettes. All three packages match the final stylesheet, renderer and version. ZIP integrity, download links, sizes and SHA-256 checks passed.
