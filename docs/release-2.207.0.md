# Further Compare 2.207.0

Three-way Text Merge accepts mixed PDF, DOCX, RTF, ODT and plain-text inputs. Original bytes stay separate from extracted text, edited source drafts and the merged result. Per-side PDF ordering supports confirmed re-extraction, and saved sessions validate extraction provenance before restoring merge decisions. This compares and merges extracted text; it does not preserve document formatting or produce document-format output.

Native exports protect opened document paths and identities across tabs and windows, including hard-link aliases. Merge results export to separate text files. Failed session opens restore the previous tab and its undo history. Failed, cancelled or superseded extraction cannot replace the existing merge; prior source panes remain disabled while a session restores.

Source validation: 2,421 passing tests, one skipped. Real browser fixtures cover all four formats, independent ODT/PDF extraction, editing/history, session restoration and cancellation. Native tests cover PDF ordering, RTF conflicts, session rollback/undo/swap, safe text exports and source/alias protection. Both Mac packages passed PDF merge, RTF session/rollback and shell-helper acceptance. All three package audits and download checks passed. Version 2.207.0 is installed with a verified startup smoke and healthy Finder Services; 2.206.0 is retained for rollback.

Windows runtime testing remains deferred. Public signing/notarization, modern Explorer deployment and broader full-product parity remain pending.
