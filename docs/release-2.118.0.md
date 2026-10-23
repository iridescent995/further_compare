# Release 2.118.0 — Automatic archive folder chains

Archive Compare now follows a chain of sole child directories when expanding a folder. This matches the existing disk-folder workflow: java/oracle/fsgbu/tfpm/orchestrator opens inline in one action. Keyboard, disclosure and right-click expansion share the behavior; selection and focus stay on the chosen folder. A file, branching node, empty directory or type conflict ends the chain. Unrelated closed siblings are not read.

Each expansion follows at most 200 folders, then shows a continuation message; the next directory can be expanded explicitly. Per-request guards prevent a collapsed or replaced chain from resuming after delayed comparison results. Related ancestor/descendant toggles invalidate that request; collapse-all, import and reset cancel every pending chain. Saved-session restoration retains its existing explicit expansion behavior.

The previous built app stopped at the first child. Updated source desktop checks pass paired/one-sided chains, all expansion routes, boundaries, focus and explicit file opening. Browser checks verify exact node reads, conflicts, the 200-node limit and continuation, collapse/reopen races, collapse-all/reset cancellation and external focus preservation. Existing archive keyboard, editing, focus and import-race checks pass.

Both Apple Silicon and Intel Mac packages pass the complete archive-chain desktop workflow. All three package versions and renderer/CSS assets match, ZIP integrity and download size/SHA-256 checks pass, the Windows ZIP downloads in the browser, and shipped sources pass the branding check. Windows runtime and full-product scope remain open.
