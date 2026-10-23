# Further Compare 2.33.1

Folder right-click menus now include Previous/Next difference in Navigate, plus display preferences and the Context filter in View. The Context filter now shows differences with their parent folders instead of an empty view, including independently aligned files.

Difference navigation marks the current row in both panes, including its empty counterpart when present on only one side. This marker is separate from file selection, so navigating does not change the files selected for copying or other operations. The marker follows the same row when sorting changes, clears when filtering hides it, and exposes its current state to assistive technology. The first Previous action visits the last difference; both directions wrap correctly.

Development checks cover navigation, sorting, masks, preserved selection, paired markers, context actions and both theme styles. Existing folder selection and live-color regressions passed. All 328 unit tests passed. Both final Mac packages passed difference-navigation and context-menu workflows (Intel under Rosetta). All three archives passed integrity checks, bundled versions and 44 UI/native files matched source, and download links, sizes, SHA-256 and the Windows browser download passed. Windows runtime testing requires a Windows host.
