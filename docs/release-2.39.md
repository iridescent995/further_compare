# Further Compare 2.39.0

Folder right-click menus now include **View → Edit filename filters…**. The native View menu also offers **Folder Filename Filters…**. Both open a dialog for include patterns, exclude patterns and path search, using the same state as the toolbar.

Apply updates the visible tree and its selection. Cancel and Escape preserve the active filters. Reset fields changes only the draft until Apply is pressed. The dialog restores tree focus and uses the shared light/dark palette with readable helper text and a viewport-constrained layout.

Source native tests passed for draft isolation, Apply/Cancel/Escape, reset, toolbar synchronization, native menu routing and keyboard focus. Light/dark previews were inspected. Both packaged Mac architectures passed the grouped context-menu suite including filter dialog Apply/Cancel/Escape/reset, toolbar synchronization, native routing and focus restoration. All three archives passed ZIP integrity, version 2.39.0 and 52 source/resource checks. Download links, sizes, SHA-256 and Windows ZIP browser download passed. Windows runtime remains unverified.
