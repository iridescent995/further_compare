# Further Compare 2.184.0

Text Options → Alignment now includes **Align code structure**, off by default. It pairs corresponding Java, XML and SQL statements inside changed sections, including statements displaced by an insertion. Original text and difference significance remain unchanged. Manual anchors, minor/equal rows and final newlines remain boundaries; selected-line copying and whole-section copying retain their separate scopes.

The option persists in tabs, saved sessions and text defaults. Reports include alignment metadata, and the comparison status explains fallback. See [code structure alignment](code-structure-alignment.md) for lexical matching behavior and limits. This is a bounded lexical feature; AST/semantic comparison and rich document conversion remain pending.

Validation: 1,910 unit tests passed, one skipped. Generated cases verify every physical line and both-direction copying. Browser and native source checks passed option toggling, inserted-statement pairing, selected-line copy, exact undo/redo and fallback; native checks also passed disk session reopen and tab isolation. Packaged Mac manual alignment passed. All three archives passed source/branding, ZIP integrity and download verification. Windows runtime testing remains deferred by user request.

Both Mac packages passed the new selected-line copy, undo/redo and saved-session workflow. The installed Apple Silicon app matches verified package bytes; Finder service registrations remain valid. Version 2.183.0 is retained for rollback. An Intel test readiness race was corrected: exports now wait for comparison completion before capture. No product change was required for that test failure.
