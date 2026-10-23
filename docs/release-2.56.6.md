# Further Compare 2.56.6

Folder color reuse now checks native file-version fingerprints alongside row metadata. The fingerprint includes file identity, mode, size and nanosecond modified/change times. This invalidates cached comparison colors after same-size edits even when modified time is restored. Renderer timestamp comparisons also retain fractional milliseconds. These fingerprints are cache hints, not authority for file operations; native row validation remains in place.

A desktop regression edits a loaded file to matching bytes, preserves its size and restores its previous modified time, then expands another branch. The row must become equal and the changed node must be compared. The regression fails on 2.56.5 with the old changed color and passes with this fix. Periodic refresh is suppressed for this case so it cannot hide the cache bug. Live-color tests and all 16 native tree tests passed.

All 473 unit tests passed. Both packaged Mac architectures passed the comparison-queue regression, including restored timestamps. The test waits for folder-picker completion before opening the second side. All three package versions, native tree modules and application bundles match the source build. ZIP integrity and browser download/checksum checks passed. Windows runtime testing remains unavailable on this Mac.
