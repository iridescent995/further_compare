# Folder interaction revalidation — 2.137.0

The original folder requirements were checked against the current source and packaged applications using disposable filesystem fixtures.

| Requirement | Evidence |
| --- | --- |
| Compact name/size/modified tree | Selection workflow asserts 23px rows and exactly Name, Size, Last modified columns on both sides. |
| Status colors update reliably | Live-color workflow gates asynchronous comparison, checks changed/equal status and accessible labels, and requires original DOM nodes, selection, focus and scroll to survive. |
| Compare only the opened node | Node-refresh workflow records native calls and requires exactly the selected node comparison, no unrelated reads, no closed descendant rows and no new tabs. |
| Click selects; double-click opens | Selection workflow checks tab count and session kind after click, modifier/range behavior, and double-click navigation. |
| Right-click access | Context inventory checks implemented actions, grouped menus, keyboard navigation, disabled items, dismissal, focus restoration and light/dark edge placement. Inventory coverage is not proof of complete product parity. |
| No selection checkboxes | Selection workflow requires zero checkbox inputs in both folder panes. |
| Inline single-child chains | Chain workflow checks paired/one-sided chains, branch/file stopping conditions, native/context/disclosure routes, preserved selection and no unrelated reads or tabs. |

All five workflows pass in source. Both packaged Mac applications pass all five workflows: selection, context menus, chain expansion, live colors and node refresh. Intel live-color validation initially hit the test's five-second predicate timeout; its cleanup then waited on the app quit guard. The same existing process was inspected and quit normally before retrying. The test now allows twenty seconds for state assertions and explicitly exits its disposable app during cleanup; product assertions are unchanged. Intel live-color/node-refresh rerun passed. The node-refresh cleanup also needed a normal quit retry after all assertions passed; its disposable-app cleanup now uses explicit exit. No product quit guard or comparison behavior was changed.

Light and dark context-menu screenshots were inspected. Windows runtime remains unverified. Full-product scope, remote sources, additional comparison formats and the other outstanding items in the implementation plan remain open.
