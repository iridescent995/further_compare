# Further Compare 2.51.1

Lazy folder comparison now retains requests received during an existing comparison pass. When it finishes, the scheduler revisits the current tree. Folders collapsed or removed before their turn are skipped, and a changed root or comparison rule invalidates the earlier pass.

A delayed native regression reproduced a collapsed folder being compared before the fix. The expanded test verifies expansion while busy, collapse before comparison, reopening, changing content comparison to metadata comparison, switching to a text draft and returning to the folder tab. It passed in both packaged Mac architectures. The existing parent-color workflow also passed in development.

All three desktop archives passed ZIP integrity, version and bundled-source checks. Download links, sizes, SHA-256 and a Windows ZIP browser download passed. Windows runtime verification and broader full-product work remain pending.
