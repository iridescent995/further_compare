# Further Compare 2.23.1

Binary Previous difference and Next difference now navigate individual ranges, including multiple changes on the same page. Each action reveals and highlights the current range in both panes, updates the range counter, and retains keyboard focus on the navigation button. Navigation wraps at either end. Explicit page navigation clears the active range; reopening an input or changing its contents resets it.

The binary byte area shares a bounded vertical viewport so both panes remain aligned and navigation controls stay above the scrolling rows. Empty or equal comparisons disable difference navigation. The existing cap of 10,000 listed ranges remains explicit.

Validation: the expanded native workflow passed in development and in both final Mac packages. Coverage includes aligned gaps, same-page and cross-page differences, wraparound, focus, visible controls, page reset, and disabled navigation for equal files, along with the existing alignment/edit/save/session checks. All three packages contain the updated UI and passed ZIP integrity checks; download links, sizes and SHA-256 hashes were verified. Windows runtime verification remains pending on a Windows host.
