# Further Compare 2.89.0

Folder Synchronize menus now offer Update left, Update right and Update both sides. Directional updates copy newer and source-only entries, retain newer destinations and target-only entries, and never delete. Timestamp tolerance, filters, alignment, recursive selected-folder scope, preview validation and backup safeguards remain in effect.

Folder Sync adds a Method selector: Mirror, Update newer files, or Update both sides. The selected method persists in sessions and workspaces and restores per tab. Legacy sessions default to Mirror. Direction is hidden for Update both sides. Context menus and queued reviews reject stale method changes.

Validation: 23 backend update tests, 30 session tests and 8 workspace tests pass. Source Electron tests cover directional context/native previews, both-direction execution, excluded entries, ambiguous timestamps, sync method selection and tab restoration, plus existing mirror/merge direction and stale-menu regressions. Independent review found no actionable defects. Packaging verification follows below.

Full product parity and Windows runtime verification remain outstanding.

Final verification: 66 related filesystem tests passed. Both Mac packages passed sync method selection, tab restoration and saved-session reopening as well as directional previews and bidirectional execution. All three package versions and changed assets matched source. ZIP integrity and download links, sizes, SHA-256 and Windows ZIP browser download passed. Shipped-source branding scan found no reference names.
