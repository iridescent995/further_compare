# Release 2.130.1 — Compact folder options

Corrected a numeric-input width rule that also widened comparison checkboxes, creating unnecessary gaps before their labels. Checkboxes now retain compact dimensions, while tolerance fields keep their numeric width. Reduced section padding and explanatory-text spacing in the pastel options dialog for both themes.

Opening Filters & options now starts at the heading with focus on its close button. Native setting shortcuts can still focus their specific controls. This fixes the previous scroll position being retained after Done, which could clip the heading when reopening.

Source desktop checks pass responsive sizes 1440×928, 1024×768 and 800×600, controls, Done/Escape focus restoration, nested encoding/report dialogs, inline expansion, single-click selection and double-click opening. Folder rows begin at y268 in the large-window check. Both themes were inspected. The full filename criterion workflow also passes. Both Mac packages passed the responsive native workflow. The Intel test initially waited at its intentional busy quit guard after assertions passed; a normal quit retry completed the same process. Test-only cleanup now exits the disposable process after assertions. A fresh Intel run passed and exited cleanly. Product quit behavior is unchanged. All three ZIPs pass integrity checks, versions and final renderer assets match source, download links/size/SHA-256 and browser Windows download pass, and shipped branding checks are clear.

Windows runtime testing and remaining full-product scope stay open.
