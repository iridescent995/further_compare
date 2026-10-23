# Version 2.173.0

Text and folder comparisons add explicit **Text format** choices: Plain text, Java, XML and SQL. Comment differences can be minor while strings, quoted names, executable SQL comments and other protected content remain significant. Original text stays editable and is preserved by copy/save operations. Ambiguous or malformed lexical constructs remain significant.

Profiles persist across tabs, saved sessions and defaults. Folder text children inherit active profiles; byte and metadata methods keep profiles dormant. Folder comparisons, snapshots, reports and CLI/batch jobs share profile-aware keys and provenance. Exact-byte file operations remain unchanged.

Comment-only rows preserve physical positions, selected-line copy and manual alignment. Newline differences remain significant. A comment-only file that needs its content to carry a final newline is shown as a visible whole-file section, so copy/undo preserves exact text instead of cycling between empty and blank states.

These are lexical comment profiles. Automatic filename selection, customizable grammar importance and full language/document comparison remain pending. See [profile behavior and CLI usage](grammar-text-profiles.md).

Verification passed: 1,762 unit tests (one skip), profile browser checks, existing minor/alignment regressions, and packaged Apple Silicon/Intel folder-profile workflows. Independent merge-sequence checks confirmed EOF convergence. All three packages passed source/static checks, ZIP integrity and download verification. Text options were visually inspected in light and dark themes. Windows runtime testing remains deferred at the user's request.
