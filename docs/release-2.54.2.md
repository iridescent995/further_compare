# Further Compare 2.54.2

Folder context menus now include Navigate → Recent left folders / Recent right folders. Both choices are available from either pane, including blank pane space. They use the same root-navigation service and recent history as the toolbar. The current root is disabled; an empty history has a disabled placeholder. Full menu labels are also available as hover titles.

Validation: navigation and grouped-context suites passed in source and both packaged Mac architectures. Tests reopen either side from either pane, preserve the other root and tab count, reject overlapping roots without replacing either side, check current-root disablement and nested Escape/focus behavior, and verify Back/Forward histories after swapping sides. Existing path entry, native navigation, tab isolation and 1024px layout checks continue to pass.

All three package versions and UI bundles matched the current build, and ZIP integrity checks passed. Windows runtime verification remains pending; broader product parity is not complete.
