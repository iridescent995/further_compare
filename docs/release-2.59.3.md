# Further Compare 2.59.3

Selected folder entries retain comparison colors on filenames and icons. The selection background and outline remain visible, while changed, matching, left-only and right-only states no longer all become the same text color. Metadata matches, normalized text matches and folders containing differences also use their corresponding status colors.

The native display regression selects four real file states across both panes with Ctrl/Command and verifies distinct filename colors, matching icon colors, 23px rows, and at least 4.5:1 filename contrast against the selected background in light and dark appearances. Screenshots of both multi-selection states were reviewed. Existing display preferences and whitespace overlay checks passed.

Both packaged Mac architectures passed the extended display regression. All three package versions and theme resources match the source, and ZIP integrity checks passed. Windows is cross-built but runtime-unverified.
