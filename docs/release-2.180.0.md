# Further Compare 2.180.0

Explicit legacy encodings now preserve leading bytes that resemble a Unicode BOM. Previously, saving valid GB18030, Big5, EUC-KR or Windows-code-page content could replace the destination and then report a decoding failure. Local and SFTP saves now decode the prepared output before any replacement.

BOM-less Unicode output that would lose a leading character or imply another byte order is rejected before writing. Enable the output BOM option to preserve that character separately from the file signature. Drafts and saved sessions retain leading U+FEFF characters without restriction.

Source verification: 1,872 tests passed, one skipped. Local native saves, SFTP saves and browser merge workflows passed, including exact legacy bytes, destination preservation on rejection, repeated remote saves, and draft/session restoration. Independent codec review checked 11,196 successful round trips and 14,104 rejected unrepresentable or ambiguous cases.

Both packaged Mac builds passed local and SFTP save regressions. All three archives passed source equality, branding, ZIP integrity and download verification. The verified Apple Silicon app is installed at `/Users/harshit/Applications/Further Compare.app`; the previous 2.179.0 app is retained for rollback. All three Finder Services registrations remain valid. Windows runtime testing remains deferred at the user's request.
