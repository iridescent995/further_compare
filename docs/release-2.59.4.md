# Further Compare 2.59.4

Native Open Selected and Reveal in File Manager now require one selected entry that matches the focused row. Previously, selecting a.txt and moving keyboard focus to b.txt let Open Selected open b.txt. Both commands now reject that mismatch and multiple selections, matching the single-target right-click actions.

The regression reproduced the unintended b.txt comparison before the fix. It now verifies mismatched and multiple selections create no comparison tab or reveal request, while an explicitly selected file can still be revealed and opened. Existing single/double click, modifier/range selection and grouped right-click menu tests passed.

Both packaged Mac architectures passed the extended selection regression. All three package versions and app bundles match source, and ZIP integrity checks passed. Windows is cross-built but runtime-unverified.
