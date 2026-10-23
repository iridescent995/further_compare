# Further Compare 2.76.0

Session tabs now use compact 26px controls in a 36px strip, neutral gray active fills and no colored accent bars, borders or shadows. Remaining button, toolbar-group and clickable text-rule toggle outlines are removed; keyboard focus and input boundaries remain visible. These styles are shared by browser, Mac and Windows.

Folder right-click Compare > Quick comparison and native Actions > Quick Comparison now show a compact result for one selected paired file. The result uses current rules, lists both paths, explains metadata-only and normalized-text checks, and includes Close and Open comparison. Closing preserves the folder selection and focus; opening uses the existing file-type routing in a child tab. Directories, one-sided entries, alignment conflicts and multiple selected files are rejected or disabled.

The workflow reuses native selected-file authority, fresh metadata and stale-context checks. It does not compare unrelated siblings or unopened descendants. Runtime regression covers matching and changed files, exact selected-only IPC, no extra tab until requested, close/Escape, focus restoration, metadata-only explanation, native/context routes and one-sided disabling.

Full product parity and Windows runtime verification remain outstanding. Final package validation is recorded in implementation-plan.json.
