# Release 2.93.0 — application settings transfer

File → Import / Export Settings and folder right-click → Session & tools now open settings transfer. Export writes a versioned `.fcsettings` file through a native Save dialog. Import and Reset present a replacement preview and require Apply changes inside the app.

The current transfer scope is appearance (theme, density, text size), folder size/modified column widths, and optional external-editor defaults and ordered profiles. Session contents, compared files, folder histories and shell-selected files are excluded. Source and target platform validation allows appearance to transfer when an editor path is incompatible with the target. The preview shows changes and exposes the exact editor configuration; importing does not launch applications.

Native import reads a bounded regular settings file; export uses guarded atomic replacement and rejects symlink/hardlink destinations. Unknown fields and versions are rejected. Apply checks that preferences have not changed since the preview. Native editor application additionally compares the expected prior configuration within serialized IPC, and uses existing executable validation. Renderer appearance storage is restored if native editor saving fails; live appearance changes only after successful application.

Validation: all 733 unit tests passed. Source runtime verified export/reset/import preview, profile restoration, column widths, incompatible Windows editor paths with portable appearance, missing-executable rollback, stale-preview/native rejection, malformed files, unsaved text preservation and folder-context access. Existing display settings tests passed. Independent read-only review found no actionable issues. Both Mac package workflows passed and the dialog was visually inspected; the final packages were refreshed with a human-readable platform-label polish only. Final Mac/Windows package versions and assets match source, all ZIP integrity checks passed, and download links, sizes, SHA-256 and a Windows ZIP browser download passed. No reference branding was found in shipped source.

Windows runtime and broader product parity remain incomplete.
