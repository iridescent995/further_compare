# Release 2.95.0 — session defaults in settings transfer

Application settings export now includes saved session defaults. Import and reset previews show the current and incoming comparison types, with an optional Include saved session defaults checkbox and expandable exact configuration. Included defaults replace the full saved list; types absent from that list return to built-in defaults. Unchecking the option preserves the existing list. Older settings files without a defaults section leave defaults unchanged, while an explicit empty list resets them.

Native apply validates selected settings and expected current values before writes. Whole-list defaults replacement is strict, bounded and atomic, with an order-independent stale-profile comparison. If saving the selected editor configuration fails, defaults are restored using an expected-state guard; a concurrent change prevents rollback from overwriting it and is reported. Appearance persistence is rolled back by the renderer on native failure. These are guarded rollback operations across separate stores, not a crash-atomic multi-file transaction. Existing sessions and input buffers are unaffected; imported profiles apply to new sessions.

Editor persistence now treats rename as the commit point and avoids unnecessary temporary-file cleanup afterward, preventing cleanup errors from reporting a successful save as failed.

Validation: all 759 unit tests passed, including the editor cleanup regression and combined-apply rollback tests. Source defaults-transfer and existing settings-transfer workflows passed export, reset/import, unchecked/legacy preservation, malformed/stale guards, failed-editor rollback, current-session preservation and future text/picture inheritance. Both Mac packages passed the defaults-transfer workflow, including failure rollback. The dialog was visually inspected. All three package versions/assets and ZIP integrity checks passed. Download links, sizes, SHA-256 and Windows ZIP browser download passed. Independent review found no remaining actionable issues; no reference branding was found in shipped source.

Windows runtime and broader feature parity remain incomplete.
