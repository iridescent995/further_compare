# Release 2.125.0 — Unix metadata folder comparison

Folder comparisons can optionally check Unix permissions, numeric owner IDs and numeric group IDs alongside the existing content, normalized-text, size and timestamp methods. Flags are off by default and persist with saved comparisons. Controls are inside Filters & options, right-click Compare > Metadata options, and native View > Folder Comparison > Unix Metadata.

Paired files and directories in the opened node are classified without scanning closed descendants. Results retain their underlying file-comparison status and the specific metadata differences, so identical bytes with different permissions are not described as different content. Reports retain this distinction. Permissions include the POSIX permission and special bits (mask 07777); ACLs and extended attributes are not included. Numeric UID/GID comparisons do not resolve account names. Windows rejects enabled Unix criteria explicitly and disables the corresponding controls. An imported session with enabled Unix rules offers Disable Unix checks to clear them; actual Windows execution remains unverified.

Node, selected-file, selected-entry refresh, filename-matching and filtered-operation snapshot paths share the criteria. Metadata changes invalidate row authority and cache entries; changes during a comparison are rejected. Comparison does not modify attributes, and existing transfer behavior and recovery formats are preserved.

Validation:

- 1,016 unit tests passed; one Windows-only skip.
- Eight focused Unix metadata tests cover flags/platform rejection, real permissions on files/directories, selected/filename workflows, snapshot eligibility, numeric owners/groups, permission-bit masks, cached changes, mid-comparison mutation and legacy directory behavior.
- Source desktop workflow passes native/context controls, opt-in/opt-out colors, scoped expansion, reports, saved-session/tab/swap retention and unchanged disk contents/metadata.
- Light and dark dialog screenshots inspected.

A deliberately delayed native scan reproduced lost choices when several metadata checkboxes were changed quickly. Queued, per-session checkbox intents now survive rescans; the gated regression fails before the fix and passes afterward. Existing folder rule, live-color and grouped-context regressions pass. Both final Mac packages pass the full native workflow, including the delayed-scan regression. All three ZIPs pass integrity checks; packaged versions, changed native modules and final renderer/CSS assets match source. Download sizes, SHA-256 and Windows browser download pass. The shipped branding search is clear. Windows execution and the broader product scope remain open.
